import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Polyline, Marker, Circle } from '@react-google-maps/api';
import { MapPin, Flag, Compass, WifiOff, Layers, Battery, Signal, Crosshair, AlertTriangle } from 'lucide-react';

const mapContainerStyle = {
  width: '100vw',
  height: '100vh'
};

const routeColors = ["#FFA500", "#FF0000", "#00FF00", "#0000FF"];
const NAVIGATION_ARROW = "M0 10L-5 -10L0 -7L5 -10L0 10Z";

const defaultCenter = {
  lat: 41.9088,
  lng: -87.6768
};

const SafeRouteNavigator = () => {
  const [center, setCenter] = useState(defaultCenter);
  const [mapRef, setMapRef] = useState(null);
  const [zoom, setZoom] = useState(15);
  const [routes, setRoutes] = useState([]);
  const [visibleRoutes, setVisibleRoutes] = useState([true, true, true, true]);
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [userPosition, setUserPosition] = useState(null);
  const [deviceOrientation, setDeviceOrientation] = useState(0);
  const [accuracy, setAccuracy] = useState(null);
  const [speed, setSpeed] = useState(null);
  const [altitude, setAltitude] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [batteryLevel, setBatteryLevel] = useState(null);
  const [isLowPower, setIsLowPower] = useState(false);
  const [networkType, setNetworkType] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: 'AIzaSyAnAszR8yWJ-xrdN61WpGU4ki08WXygS64'
  });

  const watchPositionRef = useRef(null);

  const startLocationTracking = useCallback(() => {
    if ("geolocation" in navigator) {
      const options = {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      };

      watchPositionRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, accuracy, speed, altitude } = position.coords;
          setUserPosition({ lat: latitude, lng: longitude });
          setAccuracy(accuracy);
          setSpeed(speed);
          setAltitude(altitude);

          // Auto-pan map if accuracy is good
          if (accuracy <= 20 && mapRef) {
            mapRef.panTo({ lat: latitude, lng: longitude });
          }
        },
        (error) => {
          console.error("Error getting location:", error);
        },
        options
      );
    }
  }, [mapRef]);

  const stopLocationTracking = useCallback(() => {
    if (watchPositionRef.current) {
      navigator.geolocation.clearWatch(watchPositionRef.current);
    }
  }, []);

  const handleDeviceOrientation = useCallback((event) => {
    let orientationValue;
    if (event.webkitCompassHeading) {
      orientationValue = event.webkitCompassHeading;
    } else if (event.alpha) {
      orientationValue = 360 - event.alpha;
    }
    if (orientationValue !== null) {
      setDeviceOrientation(orientationValue);
    }
  }, []);

  const handleMapLoad = useCallback((map) => {
    const mapOptions = {
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      gestureHandling: 'greedy',
      maxZoom: 20,
      minZoom: 3,
      tilt: 45
    };
    map.setOptions(mapOptions);
    setMapRef(map);
  }, []);

  const handleCenterMap = useCallback(() => {
    if (mapRef && userPosition) {
      mapRef.panTo(userPosition);
      setZoom(18);
    }
  }, [mapRef, userPosition]);

  const handleRouteToggle = useCallback((index) => {
    setVisibleRoutes(prev => {
      const newVisibleRoutes = [...prev];
      newVisibleRoutes[index] = !newVisibleRoutes[index];
      return newVisibleRoutes;
    });
  }, []);

  const fetchRoutes = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('https://pict-production.up.railway.app/route', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          start_x: center.lng,
          start_y: center.lat,
          end_x: -87.6297,
          end_y: 41.8781
        })
      });
      
      if (!response.ok) throw new Error('Network response was not ok');
      
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
    } finally {
      setIsLoading(false);
    }
  }, [center]);

  useEffect(() => {
    startLocationTracking();
    fetchRoutes();

    window.addEventListener('deviceorientation', handleDeviceOrientation, true);
    window.addEventListener('online', () => setIsOnline(true));
    window.addEventListener('offline', () => setIsOnline(false));

    if ('connection' in navigator && 'effectiveType' in navigator.connection) {
      setNetworkType(navigator.connection.effectiveType);
      navigator.connection.addEventListener('change', () => {
        setNetworkType(navigator.connection.effectiveType);
      });
    }

    if ('getBattery' in navigator) {
      navigator.getBattery().then(battery => {
        const updateBatteryStatus = () => {
          setBatteryLevel(battery.level);
          setIsLowPower(battery.level <= 0.2);
        };
        battery.addEventListener('levelchange', updateBatteryStatus);
        updateBatteryStatus();
      });
    }

    return () => {
      stopLocationTracking();
      window.removeEventListener('deviceorientation', handleDeviceOrientation);
    };
  }, [handleDeviceOrientation, startLocationTracking, stopLocationTracking, fetchRoutes]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-blue-500 border-solid mx-auto mb-4"></div>
          <p className="text-xl font-semibold text-gray-700">Loading maps...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen">
      {!isOnline && (
        <div className="absolute top-0 left-0 right-0 bg-yellow-500 text-white p-2 text-center z-50 flex items-center justify-center">
          <WifiOff className="mr-2 h-5 w-5" />
          <span className="font-semibold">Offline mode - Using cached data</span>
        </div>
      )}

      <div className="absolute top-4 right-4 space-y-2 z-40">
        {batteryLevel !== null && (
          <div className={`bg-white rounded-lg shadow-lg p-2 flex items-center ${
            isLowPower ? 'text-red-500' : 'text-green-500'
          }`}>
            <Battery className="h-5 w-5 mr-2" />
            <span className="font-medium">{Math.round(batteryLevel * 100)}%</span>
          </div>
        )}
        
        {networkType && (
          <div className="bg-white rounded-lg shadow-lg p-2 flex items-center">
            <Signal className="h-5 w-5 mr-2" />
            <span className="font-medium">{networkType.toUpperCase()}</span>
          </div>
        )}
      </div>

      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={zoom}
        onLoad={handleMapLoad}
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
                clickable: true
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

      <div className="absolute bottom-24 right-4 space-y-2">
        <button
          onClick={handleCenterMap}
          className="bg-white p-3 rounded-full shadow-lg hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Center map on current location"
        >
          <Crosshair className="h-6 w-6 text-gray-700" />
        </button>
      </div>

      <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-4 max-w-xs z-40">
        <h2 className="text-xl font-bold mb-4 text-gray-800">Routes</h2>
        <div className="space-y-2">
          {routeColors.map((color, index) => (
            <button
              key={index}
              onClick={() => handleRouteToggle(index)}
              className={`w-full flex items-center justify-between p-2 rounded transition-colors ${
                visibleRoutes[index] ? 'bg-gray-100' : 'bg-white'
              } hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500`}
            >
              <span className="font-medium text-gray-700">Route {index + 1}</span>
              <div 
                className="w-6 h-6 rounded-full border-2 border-white"
                style={{ backgroundColor: color }}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-4 max-w-xs z-40">
        <h3 className="text-lg font-semibold mb-2 text-gray-800">Status</h3>
        <div className="space-y-2 text-sm">
          <p className="flex items-center">
            <MapPin className="h-4 w-4 mr-2 text-gray-600" />
            <span className="font-medium">Accuracy:</span> {accuracy ? `${Math.round(accuracy)}m` : 'N/A'}
          </p>
          <p className="flex items-center">
            <Compass className="h-4 w-4 mr-2 text-gray-600" />
            <span className="font-medium">Speed:</span> {speed ? `${Math.round(speed * 3.6)}km/h` : 'N/A'}
          </p>
          <p className="flex items-center">
            <Layers className="h-4 w-4 mr-2 text-gray-600" />
            <span className="font-medium">Altitude:</span> {altitude ? `${Math.round(altitude)}m` : 'N/A'}
          </p>
          <p className="flex items-center">
            <AlertTriangle className="h-4 w-4 mr-2 text-gray-600" />
            <span className="font-medium">Last sync:</span> {lastSync ? new Date(lastSync).toLocaleTimeString() : 'Never'}
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-lg shadow-lg">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-2 text-gray-700">Loading routes...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SafeRouteNavigator;