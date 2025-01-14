import React from 'react';
import { SignUp } from '@clerk/clerk-react';

const SignUpPage = () => {
    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <SignUp path="/sign-up" routing="path" signInUrl="/sign-in" />
        </div>
    );
};

export default SignUpPage;