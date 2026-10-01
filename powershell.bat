@echo off
set "args=%*"
set "args=%args:-Command =%"
cmd.exe /c %args%
