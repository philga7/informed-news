# Playwright on Hetzner CPX11 - Technical Setup Guide

## Part 1: Initial Server Setup

### 1.1 Create SSH Key (On Your Local Machine)

```bash
# Generate SSH key pair
ssh-keygen -t rsa -b 4096 -C "[email protected]"

# Display public key to copy to Hetzner
cat ~/.ssh/id_rsa.pub
```

Copy the output and add it to Hetzner Console during server creation [web:97].

### 1.2 Server Configuration in Hetzner Console

- **Type**: CPX11 (Regular Performance)
- **Location**: Ashburn, VA (us-east)
- **Image**: Ubuntu 24.04
- **SSH Key**: Paste your public key
- **Backups**: Enable (adds 20% to cost)
- **IPv4/IPv6**: Both enabled

### 1.3 Initial SSH Connection

```bash
# Connect as root (use IP from Hetzner console)
ssh root@YOUR_SERVER_IP
```

### 1.4 Update System

```bash
# Update package lists and upgrade
apt update && apt upgrade -y

# Install essential tools
apt install -y curl wget git ufw fail2ban
```

## Part 2: Security Configuration

### 2.1 Create Non-Root User

```bash
# Create new user
adduser scraper

# Add to sudo group
usermod -aG sudo scraper

# Copy SSH keys to new user
rsync --archive --chown=scraper:scraper ~/.ssh /home/scraper
```

### 2.2 Configure SSH Security

```bash
# Edit SSH config
nano /etc/ssh/sshd_config
```

Update these settings [web:94][web:97]:

```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
ClientAliveInterval 300
ClientAliveCountMax 1
```

Restart SSH:

```bash
systemctl restart ssh
```

### 2.3 Configure Firewall

```bash
# Allow SSH, HTTP, HTTPS
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp

# Enable firewall
ufw enable
```

**Test new SSH connection before logging out:**

```bash
# From your local machine in new terminal
ssh scraper@YOUR_SERVER_IP
```

## Part 3: Docker Installation

### 3.1 Install Docker

```bash
# Install Docker prerequisites
sudo apt install -y ca-certificates curl gnupg lsb-release

# Add Docker GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

### 3.2 Verify Docker Installation

```bash
docker --version
docker compose version
```

## Part 4: Playwright Project Setup

### 4.1 Create Project Directory

```bash
# Create project structure
mkdir -p ~/x-scraper
cd ~/x-scraper
```

### 4.2 Create Dockerfile

Create `Dockerfile` [web:91][web:96]:

```dockerfile
FROM node:20-bookworm

# Set working directory
WORKDIR /app

# Install Playwright with dependencies
RUN npx -y playwright@1.49.0 install --with-deps chromium

# Copy package files
COPY package*.json ./

# Install Node dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create directory for session storage
RUN mkdir -p /app/sessions

# Expose API port
EXPOSE 3000

# Run application
CMD ["node", "src/index.js"]
```

### 4.3 Create Docker Compose Configuration

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  scraper:
    build: .
    container_name: x-scraper
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - X_USERNAME=${X_USERNAME}
      - X_PASSWORD=${X_PASSWORD}
      - VERCEL_API_ENDPOINT=${VERCEL_API_ENDPOINT}
      - WEBHOOK_SECRET=${WEBHOOK_SECRET}
      - ORGANIZATION_ID=${ORGANIZATION_ID}
    volumes:
      - ./sessions:/app/sessions
      - ./logs:/app/logs
    mem_limit: 3g
    cpus: 1.5
```

### 4.4 Create Environment File

Create `.env`:

```env
X_USERNAME=your_scraper_account
X_PASSWORD=your_secure_password
VERCEL_API_ENDPOINT=https://your-site.vercel.app
WEBHOOK_SECRET=your_webhook_secret
ORGANIZATION_ID=your_organization_uuid
```

**Important Notes:**
- `VERCEL_API_ENDPOINT` should be the base URL (e.g., `https://news.informedcrew.com`) without `/api/ingest`
- `ORGANIZATION_ID` is your Supabase organization UUID (found in your organization settings)
- `WEBHOOK_SECRET` must match the value in GitHub Actions secrets

**Secure the environment file:**

```bash
chmod 600 .env
```

### 4.5 Project Structure

```
~/x-scraper/
├── Dockerfile
├── docker-compose.yml
├── .env
├── package.json
├── src/
│   ├── index.js          # Express server
│   ├── scraper.js        # Playwright scraping logic
│   ├── auth.js           # X.com authentication
│   └── utils.js          # Helper functions
├── sessions/             # Persistent cookie storage
└── logs/                 # Application logs
```

### 4.6 Initialize Node.js Project

Create `package.json`:

```json
{
  "name": "x-scraper",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "express": "^4.18.2",
    "playwright": "^1.49.0",
    "playwright-extra": "^4.3.6",
    "puppeteer-extra-plugin-stealth": "^2.11.2",
    "dotenv": "^16.3.1",
    "winston": "^3.11.0"
  }
}
```

## Part 5: Build and Deploy

### 5.1 Build Docker Image

```bash
cd ~/x-scraper
docker compose build
```

### 5.2 Start Services

```bash
# Start in detached mode
docker compose up -d

# View logs
docker compose logs -f
```

### 5.3 Verify Playwright Installation

```bash
# Check if Playwright browser is installed
docker compose exec scraper npx playwright --version

# Test browser launch
docker compose exec scraper node -e "require('playwright').chromium.launch().then(b => b.close())"
```

## Part 6: Production Optimizations

### 6.1 Enable Headless Mode

In your scraper code [web:95][web:98]:

```javascript
const browser = await chromium.launch({
  headless: true,  // Essential for production
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu'
  ]
});
```

### 6.2 Configure Logging

Create log rotation config `/etc/logrotate.d/x-scraper`:

```
/home/scraper/x-scraper/logs/*.log {
  daily
  rotate 7
  compress
  delaycompress
  notifempty
  create 0640 scraper scraper
}
```

### 6.3 System Monitoring

```bash
# Monitor Docker resources
docker stats

# Check disk usage
df -h

# View container logs
docker compose logs --tail=100 -f
```

## Part 7: Maintenance Commands

### Daily Operations

```bash
# Restart service
docker compose restart

# Stop service
docker compose down

# Rebuild after code changes
docker compose down
docker compose build
docker compose up -d

# Clean up old images
docker image prune -a
```

### Health Checks

```bash
# Test scraper endpoint
curl http://localhost:3000/health

# Check if port is listening
netstat -tulpn | grep 3000

# View resource usage
htop
```

## Part 8: Troubleshooting

### Common Issues

**Playwright dependencies missing** [web:89]:
```bash
# Rebuild with --with-deps flag
docker compose exec scraper npx playwright install --with-deps chromium
```

**Out of memory errors**:
```bash
# Check memory usage
free -h

# Increase Docker memory limit in docker-compose.yml
mem_limit: 3.5g
```

**Permission errors**:
```bash
# Fix sessions directory permissions
sudo chown -R scraper:scraper ~/x-scraper/sessions
```

## Security Notes

- Never commit `.env` file to version control
- Use SSH keys only, no password authentication [web:94][web:97]
- Keep Docker and system packages updated
- Monitor logs for suspicious activity
- Rotate X.com credentials periodically
- Enable Hetzner backups for disaster recovery

## Next Steps

1. Deploy your Express API and Playwright scraping code
2. Test authentication flow with X.com
3. Configure GitHub Actions webhook
4. Set up monitoring alerts
5. Test failover and backup restoration
```
