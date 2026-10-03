@echo off
set PATH=%PATH%;C:\Windows\System32;C:\Program Files\nodejs
echo Starting npm install... > deploy_log.txt
call npm install >> deploy_log.txt 2>&1
echo Finished npm install. Starting npm run deploy... >> deploy_log.txt
call npm run deploy >> deploy_log.txt 2>&1
echo Done. >> deploy_log.txt
