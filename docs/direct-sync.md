# Direct phone-to-laptop sync

The phone app stays at its Render address. Photos are saved in the phone's IndexedDB before identification. Pending photos transfer directly to the paired laptop while the app is open and the laptop is reachable. No cloud photo queue or hosted inference is used. A Cloudflare tunnel transports requests, so photos and optional notes/GPS pass through Cloudflare, but this app does not store them there.

Walk mode's **Identify when my laptop is available** switch enables automatic identification. Results remain on the phone for review; even confident Walk matches need the user to save them to the Field Guide. Disabling the switch holds waiting drafts for manual identification. Rejected matches stay held until explicitly retried. Ordinary offline captures saved by the older capture flow retain their existing save behavior.

The open app checks the laptop every 15 seconds, and when the phone reconnects or the app becomes visible. It retries pending work when the laptop wakes. Mobile browsers may suspend a closed/background app, so reopen NatureDex to resume sync. Install/load the app while online before going out. Browser storage can be cleared or evicted; keep the app's data until photos are saved.

## One-time laptop setup

1. Install the project's backend and CPU AI dependencies and download BioCLIP as described in the README. Run `npm ci` and `npm run build` once.
2. Create a **named Cloudflare tunnel** with a stable hostname under a domain you control. Quick `trycloudflare.com` tunnels cannot provide a permanent address. Follow [Cloudflare's named tunnel setup](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/create-local-tunnel/).
3. Use a dedicated tunnel configuration, routing only the protected gateway on **8010**. Never expose the backend on 8000. Example (replace the ID, hostname and credentials path with yours):

```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: C:/Users/YOUR_USER/.cloudflared/YOUR_TUNNEL_ID.json
ingress:
  - hostname: laptop.YOUR_DOMAIN
    service: http://127.0.0.1:8010
  - service: http_status:404
```

4. Configure the companion with your exact Render origin and laptop hostname. Example from the repository root:

```powershell
.\.venv\Scripts\python.exe scripts/companion.py --configure --frontend https://naturedex.onrender.com --laptop https://laptop.YOUR_DOMAIN --tunnel YOUR_TUNNEL_ID --tunnel-config C:/PATH/TO/config.yml
```

5. Start it once to verify the connection:

```powershell
.\.venv\Scripts\python.exe scripts/companion.py
```

6. Open the private invitation saved in `.mobile/companion-invitation.txt` on your phone. It points to the permanent frontend and pairs automatically. A QR is created in `.mobile/phone-qr.png` when the companion starts. Alternatively, choose **Profile → Connect my laptop** and paste the laptop pairing link/code. The invitation secret is removed from the browser address after reading; the app remembers a scoped device token instead.
7. After verifying setup, enable automatic Windows startup:

```powershell
& '.\scripts\Install NatureDex Companion.ps1'
```

This creates a per-user Startup shortcut and starts the companion quietly. No administrator rights or firewall changes are needed. It starts at Windows sign-in, reuses a compatible existing backend, and restarts failed processes or the tunnel. It does not wake a sleeping laptop. Logs are in `.mobile/companion.log` and `.mobile/companion-processes.log`.

To remove automatic startup:

```powershell
& '.\scripts\Install NatureDex Companion.ps1' -Remove
```

Removing the shortcut does not stop an already running companion. Stop a running companion with `.\.venv\Scripts\python.exe scripts/companion.py --stop`; a manually launched instance also stops with Ctrl+C. This closes its protected gateway, tunnel and any backend it started. An existing backend it reused is left running.

## Render configuration

Static Site, build command `npm ci && npm run build`, publish directory `dist`. No AI environment variables, cloud inference instance, cloud photo database, or start command is required. Push and redeploy the updated frontend before pairing. If the laptop sleeps, capture and Walk remain available from the cached app shell.

## Connection boundaries

The protected gateway allows only exact configured HTTPS frontend origins. Cross-origin pairing creates a random bearer token bound to that origin, stored as a hash on the laptop. Cookies retain the existing same-origin phone-link behavior. Changing the laptop pairing secret invalidates previous sessions; remote device tokens expire after one year. Keep the invitation, token and Cloudflare credentials private. Startup setup keeps the pairing secret stable across restarts.

The frontend never sends a token to an illustration URL or another server. Protected photos are fetched with authorization and cached on the phone for offline viewing. Pairing from an unapproved origin, unauthenticated uploads, and unlisted gateway routes are rejected. This remains a personal laptop collection; it does not provide a shared public identification server for every visitor.

Without a Cloudflare-managed domain, another stable HTTPS transport or a metadata-only discovery service is needed before automatic reconnection can be enabled. The code does not silently substitute a temporary tunnel or upload photos to cloud storage.
