import React from "react";
import SafeRouteNavigator from "./SafeRouteNavigator";

const App = () => {
  return (
    <div className="App flex flex-col min-h-screen">
      {/* Header Section */}
      <header className="bg-gray-800 text-white py-4">
        <h1 className="text-center text-2xl font-bold">Safe Route Navigator</h1>
      </header>

      {/* Main Section */}
      <main className="flex-1 relative">
        <SafeRouteNavigator />
      </main>

      {/* Footer Section */}
      <footer className="bg-gray-800 text-white py-4 text-center">
        <p className="text-sm">&copy; 2024 SafeRoute. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default App;
