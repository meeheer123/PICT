@echo off

:: Navigate to Backend/Go and run the Go application
echo Starting the backend...
cd Backend\Go || (echo Failed to navigate to Backend\Go & exit /b)
start cmd /k "go run main.go"
cd ..\.. || (echo Failed to return to root directory & exit /b)

:: Navigate to frontend and run the development server
echo Starting the frontend...
cd frontend || (echo Failed to navigate to frontend & exit /b)
start cmd /k "npm run dev"

:: Notify the user
echo Backend and frontend are running in separate terminals.
pause
