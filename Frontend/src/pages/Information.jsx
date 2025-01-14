import React, { useState } from 'react';
import { MapPin, Plus, Globe, Phone, Mail, Bell } from 'lucide-react';

const Information = () => {
  const [emergencyContacts, setEmergencyContacts] = useState([{ name: '', phone: '' }]);
  const [notifications, setNotifications] = useState(true);
  const [showMap, setShowMap] = useState(false);

  const languages = [
    "English", "Spanish", "French", "German", "Chinese", "Japanese", "Korean",
    "Arabic", "Russian", "Portuguese", "Italian", "Hindi", "Bengali", "Telugu", 
    "Marathi", "Tamil", "Urdu", "Gujarati", "Kannada", "Malayalam", "Odia", 
    "Punjabi", "Assamese", "Maithili", "Sanskrit", "Konkani", "Santali", 
    "Kashmiri", "Manipuri", "Bodo", "Dogri", "Nepali"
  ];
  

  const addEmergencyContact = () => {
    setEmergencyContacts([...emergencyContacts, { name: '', phone: '' }]);
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-blue-50 to-green-50">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-600/10 to-green-500/10" aria-hidden="true" />
      </div>
      
      <div className="relative max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <p className="mt-3 max-w-md mx-auto text-base text-gray-500 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
            Help us personalize your journey experience by sharing a few details
          </p>
        </div>

        <div>
          <div className="bg-white shadow-2xl rounded-lg overflow-hidden">
            {/* Card Header with Gradient Border */}
            <div className="relative border-b border-gray-200">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 to-green-500"></div>
              <div className="p-6">
                <h2 className="text-3xl font-extrabold text-gray-900">
                  Personal Information
                </h2>
              </div>
            </div>
          
            <div className="p-6 space-y-8">
              {/* Language Preference */}
              <div className="space-y-2">
                <label className="text-lg font-medium text-gray-900 block">Preferred Language</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    type="text"
                    placeholder="Start typing to see suggestions..."
                    list="languages"
                  />
                  <datalist id="languages">
                    {languages.map((lang) => (
                      <option key={lang} value={lang} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Address */}
              <div className="space-y-2">
                <label className="text-lg font-medium text-gray-900 block">Home Address</label>
                <div className="space-y-4">
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <input
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      type="text"
                      placeholder="Enter your address"
                    />
                  </div>
                  <button
                    className="w-full py-2 px-4 border-2 border-blue-600 text-blue-600 hover:bg-blue-50 text-lg font-semibold rounded-md transition-colors"
                    onClick={() => setShowMap(!showMap)}
                  >
                    {showMap ? "Hide Map" : "Choose on Map"}
                  </button>
                  {showMap && (
                    <div className="h-64 bg-gray-50 rounded-md border border-gray-300 flex items-center justify-center">
                      <p className="text-gray-500">Map Interface Placeholder</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Emergency Contacts */}
              <div className="space-y-4">
                <label className="text-lg font-medium text-gray-900 block">Emergency Contacts</label>
                {emergencyContacts.map((contact, index) => (
                  <div key={index} className="flex gap-4">
                    <div className="flex-1 relative">
                      <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                      <input
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        type="text"
                        placeholder="Contact Name"
                      />
                    </div>
                    <div className="flex-1 relative">
                      <Phone className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                      <input
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        type="tel"
                        placeholder="Phone Number"
                      />
                    </div>
                    {index === emergencyContacts.length - 1 && (
                      <button
                        className="p-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                        onClick={addEmergencyContact}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Notifications */}
              <div className="flex items-center justify-between p-6 bg-gray-50 rounded-md border border-gray-200">
                <div className="space-y-1">
                  <label className="text-lg font-medium text-gray-900 block">Notification Preferences</label>
                  <p className="text-base text-gray-500">Receive alerts about your routes and safety updates</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifications}
                    onChange={(e) => setNotifications(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* Age & Gender */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-lg font-medium text-gray-900 block">Age</label>
                  <input 
                    type="number" 
                    placeholder="Enter your age" 
                    min="0" 
                    max="120"
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-lg font-medium text-gray-900 block">Gender</label>
                  <div className="flex space-x-6 pt-2">
                    {['Female', 'Male', 'Other'].map((gender) => (
                      <label key={gender} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="radio"
                          name="gender"
                          value={gender.toLowerCase()}
                          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-gray-700">{gender}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <button className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold rounded-md transition-colors">
                Save Profile
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Information;