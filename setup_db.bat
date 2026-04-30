@echo off
echo.
echo ============================================
echo  SmartGuard AI — Database Setup
echo ============================================
echo.

set /p PGPASS="'postgres' user password (enter what you set during installation): "
set PGPASSWORD=%PGPASS%

echo.
echo Creating database and user...
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE DATABASE smartguard_db;"
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE USER smartguard WITH PASSWORD 'smgh123!';"
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "ALTER ROLE smartguard SET client_encoding TO 'utf8';"
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "ALTER ROLE smartguard SET default_transaction_isolation TO 'read committed';"
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "ALTER ROLE smartguard SET timezone TO 'UTC';"
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE smartguard_db TO smartguard;"
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d smartguard_db -c "GRANT ALL ON SCHEMA public TO smartguard;"

echo.
echo Done! If you saw no major errors, the database is ready.
pause
