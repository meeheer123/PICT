import { useState } from "react";
// import Link from "next/link";
import { MapPin, Bell, User, Settings, LogOut, Search } from "lucide-react";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("overview");

  const recentJourneys = [
    { id: 1, from: "Home", to: "Work", date: "2023-05-15", safetyScore: 95 },
    { id: 2, from: "Work", to: "Gym", date: "2023-05-14", safetyScore: 88 },
    { id: 3, from: "Gym", to: "Home", date: "2023-05-14", safetyScore: 92 },
  ];

  const safetyTips = [
    "Always be aware of your surroundings",
    "Share your location with trusted contacts",
    "Stick to well-lit and populated areas",
    "Trust your instincts if you feel uncomfortable",
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-2xl font-bold text-blue-600">
              Safe<span className="text-green-500">Route</span>
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <button className="text-gray-600 hover:text-blue-600 focus:outline-none">
              <Bell className="h-5 w-5" />
            </button>
            <div className="relative">
              <button className="text-gray-600 hover:text-blue-600 focus:outline-none">
                <User className="h-5 w-5" />
              </button>
              {/* Dropdown menu would go here */}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col space-y-8">
          {/* Welcome Message */}
          <div className="bg-white shadow-sm rounded-lg p-6">
            <h1 className="text-2xl font-bold text-gray-900">
              Welcome back, User!
            </h1>
            <p className="mt-2 text-gray-600">
              Ready for a safe journey today?
            </p>
          </div>

          {/* Quick Actions */}
          <div className="bg-white shadow-sm rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
            <div className="flex flex-wrap gap-4">
              <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50">
                <MapPin className="inline-block mr-2 h-4 w-4" />
                Plan New Journey
              </button>
              <button className="px-4 py-2 border border-blue-600 text-blue-600 rounded-md hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50">
                <Bell className="inline-block mr-2 h-4 w-4" />
                Set Safety Alert
              </button>
              <button className="px-4 py-2 border border-green-600 text-green-600 rounded-md hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50">
                <Settings className="inline-block mr-2 h-4 w-4" />
                Adjust Preferences
              </button>
            </div>
          </div>
          {/* New Journey Planner */}
          <div className="bg-white shadow-sm rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Plan a New Journey</h2>
            <form className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label
                    htmlFor="from"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    From
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      id="from"
                      placeholder="Enter starting point"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                    <MapPin
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                      size={20}
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <label
                    htmlFor="to"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    To
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      id="to"
                      placeholder="Enter destination"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                    <MapPin
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                      size={20}
                    />
                  </div>
                </div>
              </div>
              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
              >
                Find Safe Route
              </button>
            </form>
          </div>
          {/* Recent Journeys */}
          <div className="bg-white shadow-sm rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Recent Journeys</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      From
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      To
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Safety Score
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {recentJourneys.map((journey) => (
                    <tr key={journey.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {journey.from}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {journey.to}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {journey.date}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            journey.safetyScore >= 90
                              ? "bg-green-100 text-green-800"
                              : journey.safetyScore >= 70
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {journey.safetyScore}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Safety Tips */}
          <div className="bg-white shadow-sm rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Safety Tips</h2>
            <ul className="list-disc pl-5 space-y-2">
              {safetyTips.map((tip, index) => (
                <li key={index} className="text-gray-600">
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
