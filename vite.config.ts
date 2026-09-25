import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { spawn } from 'child_process'
import type { Plugin } from 'vite'

const PYTHON_MAIN =
  '/Users/davidebrown/MentalmaAnalisisClient/MentalmaAnalisisClient/main.py'

// Dev-only plugin: POST /api/launch-mentalma-analysis → spawns the Python GUI
function launchAnalysisPlugin(): Plugin {
  return {
    name: 'launch-mentalma-analysis',
    configureServer(server) {
      server.middlewares.use('/api/launch-mentalma-analysis', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Content-Type', 'application/json')

        if (req.method === 'OPTIONS') { res.end('{}'); return }

        if (req.method === 'POST') {
          try {
            spawn('python3', [PYTHON_MAIN], {
              detached: true,
              stdio: 'ignore',
              cwd: '/Users/davidebrown/MentalmaAnalisisClient/MentalmaAnalisisClient',
            }).unref()
            res.end(JSON.stringify({ ok: true }))
          } catch (e) {
            res.statusCode = 500
            res.end(JSON.stringify({ ok: false, error: String(e) }))
          }
        } else {
          res.end('{}')
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(), launchAnalysisPlugin()],
  server: {
    port: 5173,
    allowedHosts: ['unsickerly-unanecdotal-greta.ngrok-free.dev'],
  },
})
