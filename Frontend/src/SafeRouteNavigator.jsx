import React, { useState, useEffect, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, Polyline, Marker, Circle } from '@react-google-maps/api';
import { MapPin, Flag, Compass, Navigation, NavigationOff } from 'lucide-react'

const mapContainerStyle = {
  width: '100vw',
  height: '100vh'
};

const center = {
  lat: 41.8781,
  lng: -87.6298
};

const routeColors = ["#FF0000", "#00FF00", "#0000FF", "#FFFF00"];
const NAVIGATION_ARROW = "M12 0L7 20L12 17L17 20L12 0Z";

const SafeRouteNavigator = () => {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: "AIzaSyAnAszR8yWJ-xrdN61WpGU4ki08WXygS64"
  });

  const [map, setMap] = useState(null);
  const [mapRef, setMapRef] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [userPosition, setUserPosition] = useState(null);
  const [deviceOrientation, setDeviceOrientation] = useState(0);
  const [visibleRoutes, setVisibleRoutes] = useState([true, true, true, true]);
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [followOrientation, setFollowOrientation] = useState(false);
  const [accuracy, setAccuracy] = useState(null);

  const handleMapRotation = useCallback(() => {
    if (mapRef && followOrientation) {
      mapRef.setHeading(deviceOrientation);
    }
  }, [mapRef, deviceOrientation, followOrientation]);

  const handleDeviceOrientation = (event) => {
    if (event.webkitCompassHeading) {
      // iOS devices - already aligned with true north
      setDeviceOrientation(event.webkitCompassHeading);
    } else if (event.alpha) {
      // Android devices - convert from arbitrary 0 to true north
      let heading = 360 - event.alpha;
      
      // Incorporate device rotation if available
      if (event.absolute && window.screen.orientation) {
        const screenOrientation = window.screen.orientation.angle;
        heading = (heading + screenOrientation) % 360;
      }
      
      setDeviceOrientation(heading);
    }
  };

  const onLoad = useCallback((map) => {
    const mapOptions = {
      zoomControl: true, // Enable zoom controls
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      rotateControl: false,
      gestureHandling: 'greedy',
      maxZoom: 20,
      minZoom: 3  // Changed from 10 to 3 to allow much further zoom out
    };
    map.setOptions(mapOptions);
    setMap(map);
    setMapRef(map);
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
    setMapRef(null);
  }, []);

  useEffect(() => {
    handleMapRotation();
  }, [deviceOrientation, followOrientation, handleMapRotation]);

  useEffect(() => {
    fetchRoutes();
    const cleanup = startTracking();

    const requestOrientationPermission = async () => {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
          const permissionState = await DeviceOrientationEvent.requestPermission();
          if (permissionState === 'granted') {
            window.addEventListener('deviceorientation', handleDeviceOrientation, true);
          }
        } catch (error) {
          console.error('Error requesting device orientation permission:', error);
        }
      } else {
        window.addEventListener('deviceorientation', handleDeviceOrientation, true);
      }
    };

    requestOrientationPermission();

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
          setAccuracy(position.coords.accuracy);
          
          // Auto-center map if accuracy is good and following is enabled
          if (followOrientation && position.coords.accuracy <= 20) {
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
      if (!followOrientation) {
        mapRef.setHeading(0);
      }
    }
  };

  const toggleOrientationFollow = () => {
    setFollowOrientation(prev => {
      if (!prev) {
        handleMapRotation();
      } else {
        mapRef?.setHeading(0);
      }
      return !prev;
    });
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
          zoom={12}  // Changed from 18 to a more reasonable default zoom
          onLoad={onLoad}
          onUnmount={onUnmount}
          options={{
            zoomControl: true,  // Enable the default zoom controls
            zoomControlOptions: {
              position: window.google.maps.ControlPosition.RIGHT_CENTER
            }
          }}
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
                anchor: new window.google.maps.Point(12, 20)
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

      {/* Route Selection Panel */}
      <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-4 min-w-[240px]">
        <h2 className="text-xl font-bold mb-4">Route Selection</h2>
        <div className="space-y-4">
          {routeColors.map((color, index) => {
            const descriptions = ["Highest Risk", "High Risk", "Medium Risk", "Lowest Risk"];
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

      {/* Navigation Controls */}
      <div className="absolute bottom-20 right-4 space-y-2">
        <button
          onClick={toggleOrientationFollow}
          className={`bg-white p-3 rounded-full shadow-lg hover:bg-gray-100 ${
            followOrientation ? 'bg-blue-500 text-white hover:bg-blue-600' : ''
          }`}
          aria-label={followOrientation ? "Stop following compass direction" : "Follow compass direction"}
          title={followOrientation ? "Stop following compass direction" : "Follow compass direction"}
        >
          {followOrientation ? (
            <NavigationOff className="h-6 w-6" /> // Shows when compass following is active
          ) : (
            <Navigation className="h-6 w-6" /> // Shows when compass following is inactive
          )}
        </button>
        
        <button
          onClick={handleCenterMap}
          className="bg-white p-3 rounded-full shadow-lg hover:bg-gray-100"
          aria-label="Center map on current location"
          title="Center map on current location"
        >
          <Compass className="h-6 w-6" />
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