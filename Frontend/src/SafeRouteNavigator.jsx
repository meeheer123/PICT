import React, { useState, useEffect, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, Polyline, Marker, Circle } from '@react-google-maps/api';
import { MapPin, Flag, Compass, WifiOff, Download, X } from 'lucide-react';

const mapContainerStyle = {
  width: '100vw',
  height: '100vh'
};

const routeColors = ["#FFA500", "#FF0000", "#FFF000", "#00FF00"];
const NAVIGATION_ARROW = "M0 10L-5 -10L0 -7L5 -10L0 10Z";

const SafeRouteNavigator = () => {
  // Core map states
  const [center, setCenter] = useState({
    lat: 41.9088,
    lng: -87.6768
  });
  const [mapRef, setMapRef] = useState(null);
  
  // Route states
  const [routes, setRoutes] = useState([]);
  const [visibleRoutes, setVisibleRoutes] = useState([true, true, true, true]);
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  
  // User location states
  const [userPosition, setUserPosition] = useState(null);
  const [deviceOrientation, setDeviceOrientation] = useState(0);
  const [accuracy, setAccuracy] = useState(null);
  
  // PWA states
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Google Maps loader
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: "AIzaSyAnAszR8yWJ-xrdN61WpGU4ki08WXygS64  "
  });

  // Device orientation handler
  const handleDeviceOrientation = useCallback((event) => {
    if (event.webkitCompassHeading) {
      setDeviceOrientation(event.webkitCompassHeading);
    } else if (event.alpha) {
      setDeviceOrientation(360 - event.alpha);
    }
  }, []);

  // Map load handler
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

  // Initialize online/offline listeners and PWA install prompt
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('deviceorientation', handleDeviceOrientation, true);

    // Handle PWA install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('deviceorientation', handleDeviceOrientation, true);
    };
  }, [handleDeviceOrientation]);

  // Initialize location tracking and route fetching
  useEffect(() => {
    fetchRoutes();
    const cleanup = startTracking();
    return cleanup;
  }, []);

  // Fetch routes from API
  const fetchRoutes = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('https://pict-production.up.railway.app/route', {
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
      // Try to get cached routes if offline
      if (!isOnline) {
        try {
          const cache = await caches.open('safe-route-navigator-v1');
          const cachedResponse = await cache.match('/route');
          if (cachedResponse) {
            const data = await cachedResponse.json();
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
          }
        } catch (cacheError) {
          console.error('Error fetching cached routes:', cacheError);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Start location tracking
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

  // Map control handlers
  const handleCenterMap = () => {
    if (mapRef && userPosition) {
      mapRef.panTo(userPosition);
      mapRef.setZoom(18);
    }
  };

  const handleGoToStart = () => {
    if (mapRef && startPoint) {
      mapRef.panTo(startPoint);
      mapRef.setZoom(18);
    }
  };

  // Route visibility toggle
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

  // PWA install handler
  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setShowInstallPrompt(false);
    }
    setDeferredPrompt(null);
  };

  if (!isLoaded) return <div className="flex items-center justify-center h-screen">Loading maps...</div>;

  return (
    <div className="relative w-full h-screen">
      {/* Offline banner */}
      {!isOnline && (
        <div className="absolute top-0 left-0 right-0 bg-yellow-500 text-white p-2 text-center z-50 flex items-center justify-center">
          <WifiOff className="mr-2 h-4 w-4" />
          <span>You are offline. Some features may be limited.</span>
        </div>
      )}

      {/* Install prompt */}
      {showInstallPrompt && (
        <div className="absolute top-16 left-4 right-4 bg-white rounded-lg shadow-lg p-4 z-50">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-semibold">Install Safe Route Navigator</h3>
            <button 
              onClick={() => setShowInstallPrompt(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="mb-4">Install this app on your device for the best experience</p>
          <button
            onClick={handleInstallClick}
            className="flex items-center bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
          >
            <Download className="h-4 w-4 mr-2" />
            Install App
          </button>
        </div>
      )}

      {/* Main map */}
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
        {/* Route polylines */}
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

        {/* User location marker */}
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

        {/* Start marker */}
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

        {/* End marker */}
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

      {/* Route selection panel */}
      <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-4 min-w-[240px]">
        <h2 className="text-xl font-bold mb-4">Route Selection</h2>
        <div className="space-y-4">
          {routeColors.map((color, index) => {
            const descriptions = ["Lowest Distance", "High Risk", "Medium Risk", "Lowest Risk"];
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

      {/* Navigation controls */}
      <div className="absolute bottom-20 right-4 space-y-2">
        <button
          onClick={handleGoToStart}
          className="bg-white p-3 rounded-full shadow-lg hover:bg-gray-100 block"
          aria-label="Go to start point"
          title="Go to start point"
        >
          <MapPin className="h-6 w-6" />
        </button>
        <button
          onClick={handleCenterMap}
          className="bg-white p-3 rounded-full shadow-lg hover:bg-gray-100 block"
          aria-label="Center map on current location"
          title="Center map on current location"
        >
          <Compass className="h-6 w-6" />
        </button>
      </div>

{/* Legend (continued) */}
<div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-4">
        <h3 className="text-lg font-semibold mb-2">Legend</h3>
        <div className="space-y-2">
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-green-500 mr-2" />
            <span>Start Point</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-red-500 mr-2" />
            <span>End Point</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-blue-400 mr-2" />
            <span>Current Location</span>
          </div>
          {accuracy && (
            <div className="flex items-center">
              <div className="w-4 h-4 rounded-full bg-blue-400 opacity-20 mr-2" />
              <span>GPS Accuracy: {Math.round(accuracy)}m</span>
            </div>
          )}
          <div className="pt-2 border-t border-gray-200">
            <div className="text-sm font-medium mb-1">Route Types:</div>
            {routeColors.map((color, index) => {
              const descriptions = ["Lowest Distance", "High Risk", "Medium Risk", "Lowest Risk"];
              return (
                <div key={index} className="flex items-center mt-1">
                  <div 
                    className="w-4 h-4 mr-2"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-sm">{descriptions[index]}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SafeRouteNavigator;