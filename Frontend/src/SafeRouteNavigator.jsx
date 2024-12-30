import React, { useState, useEffect, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, Polyline, Marker, Circle } from '@react-google-maps/api';
import { MapPin, Flag, Compass } from 'lucide-react';

const mapContainerStyle = {
  width: '100vw',
  height: '100vh'
};

const routeColors = ["#FF0000", "#00FF00", "#0000FF", "#FFFF00"];
const NAVIGATION_ARROW = "M0 10L-5 -10L0 -7L5 -10L0 10Z";

const SafeRouteNavigator = () => {
  const [center, setCenter] = useState({
    lat: 41.8781,
    lng: -87.6298
  });
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: "AIzaSyAnAszR8yWJ-xrdN61WpGU4ki08WXygS64"
  });

  const [mapRef, setMapRef] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [userPosition, setUserPosition] = useState(null);
  const [deviceOrientation, setDeviceOrientation] = useState(0);
  const [visibleRoutes, setVisibleRoutes] = useState([true, true, true, true]);
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [accuracy, setAccuracy] = useState(null);

  const handleDeviceOrientation = (event) => {
    if (event.webkitCompassHeading) {
      setDeviceOrientation(event.webkitCompassHeading);
    } else if (event.alpha) {
      setDeviceOrientation(360 - event.alpha);
    }
  };

  const onLoad = useCallback((map) => {
    const mapOptions = {
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: true,
      fullscreenControl: false,
      rotateControl: false,
      gestureHandling: 'greedy',
      maxZoom: 20,
      minZoom: 3
    };
    map.setOptions(mapOptions);
    setMapRef(map);
  }, []);

  useEffect(() => {
    fetchRoutes();
    const cleanup = startTracking();
    window.addEventListener('deviceorientation', handleDeviceOrientation, true);

    return () => {
      if (cleanup) cleanup();
      window.removeEventListener('deviceorientation', handleDeviceOrientation, true);
    };
  }, []);

  const fetchRoutes = async () => {
    try {
      const response = await fetch('https://wwqgb2tx-8080.inc1.devtunnels.ms/route', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          "start_x": -87.6768,
          "start_y": 41.9088,
          "end_x": -87.6297,
          "end_y": 41.8781
        })
      });
      const data = await response.json();
      const allRoutes = data.routes.map(route => 
        route.path.map(point => ({
          lat: point.Y,
          lng: point.X
        }))
      );
      setRoutes(allRoutes);
      
      if (allRoutes.length > 0) {
        setStartPoint(allRoutes[0][0]);
        setEndPoint(allRoutes[0][allRoutes[0].length - 1]);
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
          setCenter(newPosition);
          setAccuracy(position.coords.accuracy);
          
          if (position.coords.accuracy <= 20) {
            mapRef?.panTo(newPosition);
          }
        },
        (error) => {
          console.error("Error getting user location:", error);
        },
        {
          enableHighAccuracy: true,
          timeout: 1000,
          maximumAge: 0
        }
      );

      return () => navigator.geolocation.clearWatch(watchId);
    }
  };

  const handleCenterMap = () => {
    if (mapRef && userPosition) {
      mapRef.panTo(userPosition);
      mapRef.setZoom(18);
    }
  };

  const toggleRoute = (index) => {
    setVisibleRoutes(prev => {
      const visibleCount = prev.filter(route => route).length;
      if (!prev[index] || visibleCount > 1) {
        const newVisibleRoutes = [...prev];
        newVisibleRoutes[index] = !newVisibleRoutes[index];
        return newVisibleRoutes;
      }
      return prev;
    });
  };

  return isLoaded ? (
    <div className="relative w-full h-screen">
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={12}
        onLoad={onLoad}
        options={{
          zoomControl: true,
          streetViewControl: true
        }}
      >
        {routes.map((route, index) => (
          visibleRoutes[index] && (
            <Polyline
              key={`route-${index}`}
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
          <>
            <Circle
              center={userPosition}
              radius={accuracy}
              options={{
                fillColor: '#4285F4',
                fillOpacity: 0.2,
                strokeColor: '#4285F4',
                strokeOpacity: 0.4,
                strokeWeight: 1,
              }}
            />
            <Marker
              position={userPosition}
              icon={{
                path: NAVIGATION_ARROW,
                fillColor: '#4285F4',
                fillOpacity: 1,
                strokeWeight: 1,
                strokeColor: '#FFFFFF',
                scale: 1.5,
                rotation: deviceOrientation,
                anchor: new window.google.maps.Point(0, 0)
              }}
            />
          </>
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
 
      <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-4 min-w-[240px]">
        <h2 className="text-xl font-bold mb-4">Route Selection</h2>
        <div className="space-y-4">
          {routeColors.map((color, index) => {
            const descriptions = ["Highest Risk", "High Risk", "Medium Risk", "Lowest Risk"];
            const visibleCount = visibleRoutes.filter(route => route).length;
            const isLastVisible = visibleCount === 1 && visibleRoutes[index];
            
            return (
              <div key={index} className="flex items-center justify-between">
                <label className={`relative inline-flex items-center ${isLastVisible ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input
                    type="checkbox"
                    checked={visibleRoutes[index]}
                    onChange={() => toggleRoute(index)}
                    className="sr-only peer"
                    disabled={isLastVisible}
                  />
                  <div className="w-14 h-8 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 
                                peer-focus:ring-blue-300 rounded-full peer dark:bg-gray-700 
                                peer-checked:after:translate-x-full peer-checked:bg-black 
                                after:content-[''] after:absolute after:top-[2px] after:left-[2px] 
                                after:bg-white after:border-gray-300 after:border after:rounded-full 
                                after:h-7 after:w-7 after:transition-all">
                  </div>
                  <span className={`ml-4 text-base font-medium ${isLastVisible ? 'opacity-50' : ''}`}>
                    {descriptions[index]}
                  </span>
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
 
      <div className="absolute bottom-20 right-4">
        <button
          onClick={handleCenterMap}
          className="bg-white p-3 rounded-full shadow-lg hover:bg-gray-100"
          aria-label="Center map on current location"
          title="Center map on current location"
        >
          <Compass className="h-6 w-6" />
        </button>
      </div>
 
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
          {accuracy && (
            <div className="flex items-center">
              <div className="w-4 h-4 rounded-full bg-blue-400 opacity-20 mr-2" />
              <span>GPS Accuracy: {Math.round(accuracy)}m</span>
            </div>
          )}
        </div>
      </div>
    </div>
  ) : <div>Loading...</div>;
};

export default SafeRouteNavigator;