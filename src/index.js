const puppeteer = require('puppeteer');
const express = require('express');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

async function getNovelsData() {
    const browser = await puppeteer.launch({ 
        headless: "new",
        defaultViewport: { width: 1920, height: 1080 },
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(10000);
    
    await page.setRequestInterception(true);
    page.on('request', (request) => {
        const resourceType = request.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
            request.abort();
        } else {
            request.continue();
        }
    });

    await page.goto('https://reaperscans.com/novels', { 
        waitUntil: 'networkidle0',
        timeout: 10000
    });

    while (true) {
        try {
            const button = await page.waitForSelector('button.justify-center.whitespace-nowrap.rounded-md.text-sm.font-medium.ring-offset-background.transition-colors.focus-visible\\:outline-none.focus-visible\\:ring-2.focus-visible\\:ring-ring.focus-visible\\:ring-offset-2.disabled\\:pointer-events-none.disabled\\:opacity-50.\\[\\&_svg\\]\\:pointer-events-none.\\[\\&_svg\\]\\:size-4.\\[\\&_svg\\]\\:shrink-0.bg-primary.text-primary-foreground.hover\\:bg-primary\\/90.h-10.px-4.py-2.flex.flex-row.gap-2.items-center', {
                timeout: 1000
            }).catch(() => null);

            if (!button) break;

            await button.click();
            await page.waitForNetworkIdle({ timeout: 1000 }).catch(() => {});
        } catch (error) {
            break;
        }
    }

    const novels = await page.evaluate(() => {
        const gridDiv = document.querySelector('div.grid.grid-cols-1.lg\\:grid-cols-2.gap-2');
        if (!gridDiv) return [];

        const anchors = gridDiv.querySelectorAll('a');
        return Array.from(anchors).map(anchor => ({
            href: anchor.href,
            title: anchor.title || anchor.textContent.trim(),
            content: anchor.textContent.trim()
        }));
    });

    await browser.close();
    return novels;
}

app.get('/api/novels', async (req, res) => {
    try {
        const novels = await getNovelsData();
        res.json({
            success: true,
            count: novels.length,
            data: novels
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.listen(port, () => {
    console.log("IT IS ON!")
});
