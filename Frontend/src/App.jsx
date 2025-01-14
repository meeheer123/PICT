import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { SignedIn, SignedOut, useUser, RedirectToSignIn } from '@clerk/clerk-react';
import Home from './pages/Home';
import Information from './pages/Information';
import SafeRouteNavigator from './pages/SafeRouteNavigator';
import SignUpPage from './pages/SignUpPage';

const ProtectedRoute = ({ children }) => {
    const { user } = useUser();

    if (!user) {
        return <RedirectToSignIn />;
    }

    const hasFilledInformation = user?.publicMetadata?.hasFilledInformation;

    if (!hasFilledInformation) {
        console.log("Hi")
        return <Navigate to="/information" />;
    }
    else
    {
        console.log(user?.publicMetadata?.hasFilledInformation)
    }

    return children;
};

function App() {
    return (
        <Router>
            <Routes>
                {/* Public Routes */}
                <Route path="/" element={<Home />} />
                <Route path="/sign-up" element={<SignUpPage />} />

                {/* Form Page */}
                <Route path="/information" element={<Information />} />

                {/* Protected Route */}
                <Route
                    path="/safe-route"
                    element={
                        <SignedIn>
                            <ProtectedRoute>
                                <SafeRouteNavigator />
                            </ProtectedRoute>
                        </SignedIn>
                    }
                />

                {/* Redirect Signed-Out Users */}
                <Route
                    path="*"
                    element={
                        <SignedOut>
                            <Navigate to="/sign-up" />
                        </SignedOut>
                    }
                />
            </Routes>
        </Router>
    );
}

export default App;
