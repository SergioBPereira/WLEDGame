.PHONY: dev test deploy install-service restart status logs uninstall

dev:
	cd /root/wled_game && node server.js

test:
	cd /root/wled_game && npm test

deploy:
	sudo /root/wled_game/bin/deploy.sh

install-service:
	sudo cp /root/wled_game/systemd/wledgame.service /etc/systemd/system/
	sudo systemctl daemon-reload
	sudo systemctl enable wledgame

restart:
	sudo systemctl restart wledgame && sudo journalctl -u wledgame -n 20 --no-pager

status:
	sudo systemctl status wledgame --no-pager

logs:
	sudo journalctl -u wledgame -f

uninstall:
	-sudo systemctl disable --now wledgame
	-sudo rm /etc/systemd/system/wledgame.service
	sudo systemctl daemon-reload
	-sudo rm -rf /opt/wledgame /var/lib/wledgame
	-sudo userdel wledgame
