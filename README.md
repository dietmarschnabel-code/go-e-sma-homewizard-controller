# go-e-sma-homewizard-controller
Linux bash script to provide data for for a go-e-charger (Gemini in my case) with support for loadmanagment to avoid higher Austrian net charges for above 10KW house supprt and with a sample connection to a 15 years bluetooth connected sma inverter 

The script is quite simple and easy to understand - it has been created with google ai search (which helped me to find the right statments easier.
I used this script for a 1/2 Year already but as i was also now embedding new code to support load management and limmit power consumption of our house to 10 KW i thought it is time to release this code.

It might be useful for anyone owning a Go-charger with or without PV as the Homewizard P1 Meter is very useful for not only for PV charging but it can also be used for go-chargers to limit costs on the electricity bill as in Austria net
charges will be extended if 10KW are exceeded - though the exact regulation is not 100% clear yet.

Usage: - you have to adapt the script with the correct IP address for your go-e charger, and homewizard P1 meter (or replace the code with some other controller's code) Also you have to adapt the code for reading the data from an sma or or other inverter. 
This can be easily done with google ai search help.

Then you just need to start the script. (you might test with bash -x) I am also planning to release a debian package which includes startup file and more configuration files. This should be also able to run on a rasperry pi environment. (but i run it on a laptop with ubuntu 26.04)
