// Import Mapbox as an ESM module
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

   // Set your Mapbox access token here
   mapboxgl.accessToken = 'pk.eyJ1IjoiYW5oMTIzMSIsImEiOiJjbTdsMnhtajkwNzAyMnFweDE0NzM3ZzJwIn0.WYc5n3SHGjU0bD4BZfAtNg';

   // Initialize the map
   const map = new mapboxgl.Map({
     container: 'map', // ID of the div where the map will render
     style: 'mapbox://styles/mapbox/streets-v12', // Map style
     center: [-71.09415, 42.36027], // [longitude, latitude]
     zoom: 12, // Initial zoom level
     minZoom: 5, // Minimum allowed zoom
     maxZoom: 18 // Maximum allowed zoom
   });

   const svg = d3.select('#map').select('svg');
      
   function getCoords(station) {
        const point = new mapboxgl.LngLat(+station.lon, +station.lat);  // Convert lon/lat to Mapbox LngLat
        const { x, y } = map.project(point);  // Project to pixel coordinates
        return { cx: x, cy: y };  // Return as object for use in SVG attributes
      }

      let departuresByMinute = Array.from({ length: 1440 }, () => []);
      let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

   map.on('load', async () => { 
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson'
      });

      map.addLayer({
        id: 'bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: {
          'line-color': '#32D400',  // A bright green using hex code
  'line-width': 3,          // Thicker lines
  'line-opacity': 0.6       // Slightly less transparent
        }
      });

      let jsonData;
    try {
        const jsonurl = "https://dsc106.com/labs/lab07/data/bluebikes-stations.json";
        
        // Await JSON fetch
        jsonData = await d3.json(jsonurl);
        
        console.log('Loaded JSON Data:', jsonData); // Log to verify structure
    } catch (error) {
        console.error('Error loading JSON:', error); // Handle errors
    }

    
   //within the map.on('load') 
let trips = await d3.csv(
    'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
    (trip) => {
      trip.started_at = new Date(trip.started_at);
      trip.ended_at = new Date(trip.ended_at);
      return trip;
    },
  );

  trips.forEach(trip => {
    // Bucket by start time
    let startedMinutes = minutesSinceMidnight(trip.started_at);
    departuresByMinute[startedMinutes].push(trip);

    // Bucket by end time
    let endedMinutes = minutesSinceMidnight(trip.ended_at);
    arrivalsByMinute[endedMinutes].push(trip);
});

    const stations = computeStationTraffic(jsonData.data.stations);

      const radiusScale = d3
      .scaleSqrt()
      .domain([0, d3.max(stations, (d) => d.totalTraffic)])
      .range([0, 25]);

    let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);
    

    // Append circles to the SVG for each station
    const circles = svg.selectAll('circle')
    .data(stations, (d) => d.short_name)  // Use station ID as the key
    .enter()
    .append('circle')
    .attr('r', d => radiusScale(d.totalTraffic))  // Radius of the circle  // Circle fill color
    .attr('stroke', 'white')    // Circle border color
    .attr('stroke-width', 1)    // Circle border thickness
    .attr('opacity', 0.8)
    .each(function(d) {
        // Add <title> for browser tooltips
        d3.select(this)
          .append('title')
          .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
      })
      .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic));      // Circle opacity

    // Function to update circle positions when the map moves/zooms
    function updatePositions() {
        circles
          .attr('cx', d => getCoords(d).cx)  // Set the x-position using projected coordinates
          .attr('cy', d => getCoords(d).cy); // Set the y-position using projected coordinates
      }
  
      // Initial position update when map loads
      updatePositions();

    // Reposition markers on map interactions
    map.on('move', updatePositions);     // Update during map movement
    map.on('zoom', updatePositions);     // Update during zooming
    map.on('resize', updatePositions);   // Update on window resize
    map.on('moveend', updatePositions);  // Final adjustment after movement ends
    
    const timeSlider = document.getElementById('time-slider');
    const selectedTime = document.getElementById('selected-time');
    const anyTimeLabel = document.getElementById('any-time');
  
    function updateTimeDisplay() {
      const timeFilter = Number(timeSlider.value);  // Get slider value
    
      if (timeFilter === -1) {
        selectedTime.textContent = '';  // Clear time display
        anyTimeLabel.style.display = 'block';  // Show "(any time)"
      } else {
        selectedTime.textContent = formatTime(timeFilter);  // Display formatted time
        anyTimeLabel.style.display = 'none';  // Hide "(any time)"
      }

      updateScatterPlot(timeFilter);  // Update scatter plot based on time
    }
    
    function updateScatterPlot(timeFilter) {
        // Get only the trips that match the selected time filter
        const filteredStations = computeStationTraffic(stations, timeFilter);
        
        timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);

        // Update the scatterplot by adjusting the radius of circles
        circles
          .data(filteredStations, d => d.short_name) // Update the data bound to the circles
          .join('circle') // Ensure the data is bound correctly
          .attr('r', (d) => radiusScale(d.totalTraffic))
          .style('--departure-ratio', (d) =>
            stationFlow(d.departures / d.totalTraffic),
          ); // Update circle sizes
    }
    
    timeSlider.addEventListener('input', updateTimeDisplay);
    updateTimeDisplay();
  });

  function formatTime(minutes) {
      const date = new Date(0, 0, 0, 0, minutes);  // Set hours & minutes
      return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
    }
  
    function computeStationTraffic(stations, timeFilter = -1) {
    
        const arrivals = d3.rollup(
        filterByMinute(departuresByMinute, timeFilter),
        (v) => v.length,            // Count the number of arrivals
        (d) => d.end_station_id     // Group by end station ID
    );

        const departures = d3.rollup(
            filterByMinute(departuresByMinute, timeFilter),
                (v) => v.length,
                (d) => d.start_station_id,
            );

        // Update each station..
        return stations.map((station) => {
          let id = station.short_name;
          station.arrivals = arrivals.get(id) ?? 0;
          station.departures = departures.get(id) ?? 0;
          station.totalTraffic = station.arrivals + station.departures;
          return station;
      });
    }

    function minutesSinceMidnight(date) {
        return date.getHours() * 60 + date.getMinutes();
      }

function filterByMinute(tripsByMinute, minute) {
  if (minute === -1) {
    return tripsByMinute.flat(); // No filtering, return all trips
  }

  // Normalize both min and max minutes to the valid range [0, 1439]
  let minMinute = (minute - 60 + 1440) % 1440;
  let maxMinute = (minute + 60) % 1440;

  // Handle time filtering across midnight
  if (minMinute > maxMinute) {
    let beforeMidnight = tripsByMinute.slice(minMinute);
    let afterMidnight = tripsByMinute.slice(0, maxMinute);
    return beforeMidnight.concat(afterMidnight).flat();
  } else {
    return tripsByMinute.slice(minMinute, maxMinute).flat();
  }
}