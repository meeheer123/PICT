import React, { useState, useEffect, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, Polyline, Marker } from '@react-google-maps/api';
import { ChevronDown, MapPin, Flag } from 'lucide-react';

const mapContainerStyle = {
  width: '100vw',
  height: '100vh'
};

const center = {
  lat: 41.8781,
  lng: -87.6298
};

const routeColors = ["#FF0000", "#00FF00", "#0000FF", "#FFFF00"];

const SafeRouteNavigator = () => {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: "AIzaSyAnAszR8yWJ-xrdN61WpGU4ki08WXygS64"
  });

  const [map, setMap] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [userPosition, setUserPosition] = useState(null);
  const [visibleRoutes, setVisibleRoutes] = useState([true, true, true, true]);
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);

  const onLoad = useCallback((map) => {
    const mapOptions = {
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: true,
      fullscreenControl: true
    };
    map.setOptions(mapOptions);
    setMap(map);
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  useEffect(() => {
    fetchRoutes();
    startTracking();
  }, []);

  const fetchRoutes = async () => {
    try {
      const response = await fetch('https://wwqgb2tx-8080.inc1.devtunnels.ms/route', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          "start_x": -87.7154,
          "start_y": 41.8881,
          "end_x": -87.6298,
          "end_y": 41.8781
        }),
      });
      const data = await response.json();
      const allRoutes = data.routes.map(route => 
        route.path.map(point => ({
          lat: point.Y,
          lng: point.X
        }))
      );
      setRoutes(allRoutes);
      
      // Set start and end points
      if (allRoutes.length > 0) {
        console.log(allRoutes)
        setStartPoint(allRoutes[0][0]);
        setEndPoint(allRoutes[0][allRoutes[0].length - 1]);
        console.log('Start Point:', allRoutes[0][0]);
        console.log('End Point:', allRoutes[0][allRoutes[0].length - 1]);
      }
    } catch (error) {
      console.error('Error fetching routes:', error);
    }
  };

  const startTracking = () => {
    if ("geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const newPosition = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setUserPosition(newPosition);
        },
        (error) => {
          console.error("Error getting user location:", error);
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        }
      );

      return () => navigator.geolocation.clearWatch(watchId);
    }
  };

  const toggleRoute = (index) => {
    setVisibleRoutes(prev => {
      const newVisibleRoutes = [...prev];
      newVisibleRoutes[index] = !newVisibleRoutes[index];
      return newVisibleRoutes;
    });
  };

  return isLoaded ? (
    <div className="relative w-full h-screen">
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={10}
        onLoad={onLoad}
        onUnmount={onUnmount}
      >
        {routes.map((route, index) => (
          visibleRoutes[index] && (
            <Polyline
              key={`route-${index}-${visibleRoutes[index]}`}
              path={route}
              options={{
                strokeColor: routeColors[index],
                strokeOpacity: 1.0,
                strokeWeight: 3,
              }}
            />
          )
        ))}
        {userPosition && (
          <Marker
            position={userPosition}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 7,
              fillColor: "#4285F4",
              fillOpacity: 1,
              strokeWeight: 2,
              strokeColor: "#FFFFFF",
            }}
          />
        )}
        {startPoint && (
          <Marker
            position={startPoint}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: "#00FF00",
              fillOpacity: 1,
              strokeWeight: 1,
              strokeColor: "#FFFFFF",
            }}
            label={{
              text: "S",
              color: "#FFFFFF",
              fontWeight: "bold",
            }}
          />
        )}
        {endPoint && (
          <Marker
            position={endPoint}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: "#FF0000",
              fillOpacity: 1,
              strokeWeight: 2,
              strokeColor: "#FFFFFF",
            }}
            label={{
              text: "E",
              color: "#FFFFFF",
              fontWeight: "bold",
            }}
          />
        )}
      </GoogleMap>

      {/* Route Selection Panel */}
      <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-4 min-w-[240px]">
        <h2 className="text-xl font-bold mb-4">Route Selection</h2>
        <div className="space-y-4">
          {routeColors.map((color, index) => {
            const descriptions = ["Highest Risk ", "High Risk", "Medium Risk", "Lowest Risk"];
            return (
              <div key={index} className="flex items-center justify-between">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={visibleRoutes[index]}
                    onChange={() => toggleRoute(index)}
                    className="sr-only peer"
                  />
                  <div className="w-14 h-8 bg-gray-200 rounded-full peer 
                                  peer-checked:bg-black peer-focus:ring-2 
                                  peer-focus:ring-gray-300">
                    <div className="absolute left-[4px] top-[4px] bg-white w-6 h-6 
                                    rounded-full transition-all duration-300 transform 
                                    peer-checked:translate-x-6"></div>
                  </div>
                  <span className="ml-4 text-base font-medium">{descriptions[index]}</span>
                </label>
                <div 
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: color }}
                />
              </div>
            );
          })}
        </div>
      </div>


      {/* Map Type Control */}
      <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg">
        <button className="px-4 py-2 text-sm font-medium flex items-center">
          Map <ChevronDown className="ml-2 h-4 w-4" />
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-4">
        <h3 className="text-lg font-semibold mb-2">Legend</h3>
        <div className="space-y-2">
          <div className="flex items-center">
            <MapPin className="text-green-500 mr-2" />
            <span>Start Point</span>
          </div>
          <div className="flex items-center">
            <Flag className="text-red-500 mr-2" />
            <span>End Point</span>
          </div>
        </div>
      </div>
    </div>
  ) : <div>Loading...</div>;
}

export default SafeRouteNavigator;

