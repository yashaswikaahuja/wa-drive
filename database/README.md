# Database

PostgreSQL schema for CyberControl.

## Setup

```bash
sudo -u postgres createdb cybercontrol
sudo -u postgres createuser cybercontrol_app -P
# Password: cybercontrol123
sudo -u postgres psql -d cybercontrol -c "GRANT ALL ON DATABASE cybercontrol TO cybercontrol_app;"
sudo -u postgres psql -d cybercontrol -f schema.sql
sudo -u postgres psql -d cybercontrol -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO cybercontrol_app;"
```

## Connection

```
postgresql://cybercontrol_app:cybercontrol123@localhost:5432/cybercontrol
```
