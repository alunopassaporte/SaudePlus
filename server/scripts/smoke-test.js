const app = require('../src/app');

async function main() {
    const server = app.listen(0);
    try {
        const port = server.address().port;
        const base = `http://127.0.0.1:${port}`;
        const health = await fetch(`${base}/health`);
        if (health.status !== 200) throw new Error(`GET /health retornou ${health.status}`);
        const healthBody = await health.json();
        if (!healthBody.ok) throw new Error('GET /health não retornou ok=true');

        const protectedRoutes = ['/admin/stats', '/admin/export/summary.csv', '/health-units/manage', '/me/reminders'];
        for (const route of protectedRoutes) {
            const response = await fetch(base + route);
            if (response.status !== 401) throw new Error(`${route} deveria retornar 401 sem token, retornou ${response.status}`);
        }
        console.log('Smoke test aprovado: saúde e proteção das rotas críticas.');
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

main().catch((error) => {
    console.error('Smoke test falhou:', error.message);
    process.exit(1);
});