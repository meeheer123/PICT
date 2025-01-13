import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Polyline, Marker, Circle } from '@react-google-maps/api';
import { Map, Eye, EyeOff, ChevronRight, InfoIcon, Compass, WifiOff, Layers, Battery, Signal, Crosshair, Flag, Menu, X, Sun, Moon, Share2, Download, AlertTriangle, MapPin } from 'lucide-react';

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};

const routeColors = ["#FF6384", "#36A2EB", "#FFCE56"];
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
  const [visibleRoutes, setVisibleRoutes] = useState([true, true, true]);
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
  const [isLoading, setIsLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showWeatherAlert, setShowWeatherAlert] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

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
        },
        (error) => {
          console.error("Error getting location:", error);
        },
        options
      );
    }
  }, []);

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
      zoomControl: false,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      gestureHandling: 'greedy',
      maxZoom: 20,
      minZoom: 3,
      tilt: 45,
      styles: isDarkMode ? [
        { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
      ] : []
    };
    map.setOptions(mapOptions);
    setMapRef(map);
  }, [isDarkMode]);

  const handleCenterOnUser = useCallback(() => {
    if (mapRef && userPosition) {
      mapRef.panTo(userPosition);
      setZoom(18);
    }
  }, [mapRef, userPosition]);

  const handleCenterOnStart = useCallback(() => {
    if (mapRef && startPoint) {
      mapRef.panTo(startPoint);
      setZoom(18);
    }
  }, [mapRef, startPoint]);

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

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode(prev => !prev);
    document.documentElement.classList.toggle('dark');
  }, []);

  const handleShare = useCallback(() => {
    if (navigator.share) {
      navigator.share({
        title: 'Safe Route Navigator',
        text: 'Check out this safe route!',
        url: window.location.href,
      })
        .then(() => console.log('Successful share'))
        .catch((error) => console.log('Error sharing', error));
    }
  }, []);

  const handleInstall = useCallback(() => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt');
        } else {
          console.log('User dismissed the install prompt');
        }
        setDeferredPrompt(null);
      });
    }
  }, [deferredPrompt]);

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

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });

    // Simulating weather alert after 10 seconds
    const weatherAlertTimeout = setTimeout(() => {
      setShowWeatherAlert(true);
    }, 10000);

    return () => {
      stopLocationTracking();
      window.removeEventListener('deviceorientation', handleDeviceOrientation);
      clearTimeout(weatherAlertTimeout);
    };
  }, [handleDeviceOrientation, startLocationTracking, stopLocationTracking, fetchRoutes]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-blue-500 border-solid mx-auto mb-4"></div>
          <p className="text-xl font-semibold text-gray-700 dark:text-gray-300">Loading maps...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative w-full h-screen ${isDarkMode ? 'dark' : ''}`}>
      {!isOnline && (
        <div className="absolute top-0 left-0 right-0 bg-yellow-500 text-white p-2 text-center z-50 flex items-center justify-center">
          <WifiOff className="mr-2 h-5 w-5" />
          <span className="font-semibold">Offline mode - Using cached data</span>
        </div>
      )}

      <div className="absolute top-4 right-4 space-y-2 z-40">
        {batteryLevel !== null && (
          <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-lg p-2 flex items-center ${
            isLowPower ? 'text-red-500' : 'text-green-500'
          }`}>
            <Battery className="h-5 w-5 mr-2" />
            <span className="font-medium">{Math.round(batteryLevel * 100)}%</span>
          </div>
        )}
        
        {networkType && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-2 flex items-center">
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
          onClick={handleCenterOnUser}
          className="bg-white dark:bg-gray-800 p-3 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Center map on user location"
        >
          <Crosshair className="h-6 w-6 text-gray-700 dark:text-gray-300" />
        </button>
        <button
          onClick={handleCenterOnStart}
          className="bg-white dark:bg-gray-800 p-3 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Center map on start point"
        >
          <Flag className="h-6 w-6 text-gray-700 dark:text-gray-300" />
        </button>
      </div>

      <button
        onClick={() => setIsMenuOpen(true)}
        className="absolute top-4 left-4 bg-white dark:bg-gray-800 p-2 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="Open menu"
      >
        <Menu className="h-6 w-6 text-gray-700 dark:text-gray-300" />
      </button>

      {isMenuOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-80">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">Menu</h2>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="space-y-4">
              <button
                onClick={toggleDarkMode}
                className="w-full flex items-center justify-between p-2 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <span className="text-gray-800 dark:text-gray-200">Toggle Dark Mode</span>
                {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
              <button
                onClick={handleShare}
                className="w-full flex items-center justify-between p-2 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <span className="text-gray-800 dark:text-gray-200">Share Route</span>
                <Share2 className="h-5 w-5" />
              </button>
              {deferredPrompt && (
                <button
                  onClick={handleInstall}
                  className="w-full flex items-center justify-between p-2 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <span className="text-gray-800 dark:text-gray-200">Install App</span>
                  <Download className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="absolute top-4 left-4 bg-white dark:bg-gray-800 bg-opacity-90 dark:bg-opacity-90 rounded-lg shadow-lg p-4 max-w-sm z-40">
        <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-200 flex items-center">
          <Map className="h-6 w-6 mr-2 text-blue-500" />
          Route Options
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Select the routes you want to display on the map:</p>
        <div className="space-y-2">
          {routeColors.map((color, index) => (
            <button
              key={index}
              onClick={() => handleRouteToggle(index)}
              className={`w-full flex items-center justify-between p-2 rounded transition-colors ${
                visibleRoutes[index] ? 'bg-gray-100 dark:bg-gray-700' : 'bg-white dark:bg-gray-800'
              } hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500`}
            >
              <div className="flex items-center">
                <div 
                  className={`w-6 h-6 rounded-full border-2 border-white dark:border-gray-800 mr-3 ${visibleRoutes[index] ? 'bg-opacity-100' : 'bg-opacity-50'}`}
                  style={{ backgroundColor: color }}
                />
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {visibleRoutes[index] ? (
                    <Eye className="h-5 w-5 text-green-500 mr-2" />
                  ) : (
                    <EyeOff className="h-5 w-5 text-red-500 mr-2" />
                  )}
                  Route {index + 1}
                </span>
              </div>
              <ChevronRight className={`h-5 w-5 text-gray-400 transition-transform ${visibleRoutes[index] ? 'transform rotate-90' : ''}`} />
            </button>
          ))}
        </div>
        <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
          <InfoIcon className="h-5 w-5 inline-block mr-2 text-blue-500" />
          Click on a route to show/hide it on the map.
        </div>
      </div>

      <div className="absolute bottom-4 left-4 bg-white dark:bg-gray-800 bg-opacity-90 dark:bg-opacity-90 rounded-lg shadow-lg p-4 max-w-xs z-40">
        <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">Status</h3>
        <div className="space-y-2 text-sm">
          <p className="flex items-center text-gray-600 dark:text-gray-400">
            <MapPin className="h-4 w-4 mr-2" />
            <span className="font-medium">Accuracy:</span> {accuracy ? `${Math.round(accuracy)}m` : 'N/A'}
          </p>
          <p className="flex items-center text-gray-600 dark:text-gray-400">
            <Compass className="h-4 w-4 mr-2" />
            <span className="font-medium">Speed:</span> {speed ? `${Math.round(speed * 3.6)}km/h` : 'N/A'}
          </p>
          <p className="flex items-center text-gray-600 dark:text-gray-400">
            <Layers className="h-4 w-4 mr-2" />
            <span className="font-medium">Altitude:</span> {altitude ? `${Math.round(altitude)}m` : 'N/A'}
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-2 text-gray-700 dark:text-gray-300">Loading routes...</p>
          </div>
        </div>
      )}

      {showWeatherAlert && (
        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 rounded shadow-lg z-50">
          <div className="flex items-center">
            <AlertTriangle className="h-6 w-6 mr-2" />
            <p className="font-bold">Weather Alert: Heavy rain expected in your area.</p>
          </div>
          <p className="mt-2">Please take necessary precautions and stay safe.</p>
          <button
            onClick={() => setShowWeatherAlert(false)}
            className="mt-2 bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-1 px-2 rounded text-xs"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
};

export default SafeRouteNavigator;

