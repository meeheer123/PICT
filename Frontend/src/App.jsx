import React from 'react';
import SafeRouteNavigator from './SafeRouteNavigator';

function App() {
  return (
    <div className="App flex flex-col h-screen overflow-hidden">
      <header className="bg-gray-800 text-white flex items-center justify-center h-12">
        <h1>My App</h1>
      </header>
      <main className="flex-grow relative">
        <SafeRouteNavigator />
      </main>
      <footer className="bg-gray-800 text-white text-center h-8">
        &copy; 2023 My App
      </footer>
    </div>
  );
}

export default App;

