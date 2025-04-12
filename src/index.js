const puppeteer = require('puppeteer');
const express = require('express');
const cors = require('cors');

const app = express();
const port = 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

async function getNovelsData() {
    const browser = await puppeteer.launch({ 
        headless: "new", // Use new headless mode for better performance
        defaultViewport: { width: 1920, height: 1080 }, // Set specific viewport
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // Improve performance
    });

    const page = await browser.newPage();
    
    // Set a shorter timeout for page navigation
    await page.setDefaultNavigationTimeout(10000);
    
    // Disable unnecessary resources
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

    let clickCount = 0;
    console.log('🔄 Starting to click Load More button...');

    while (true) {
        try {
            // Wait for button with shorter timeout
            const button = await page.waitForSelector('button.justify-center.whitespace-nowrap.rounded-md.text-sm.font-medium.ring-offset-background.transition-colors.focus-visible\\:outline-none.focus-visible\\:ring-2.focus-visible\\:ring-ring.focus-visible\\:ring-offset-2.disabled\\:pointer-events-none.disabled\\:opacity-50.\\[\\&_svg\\]\\:pointer-events-none.\\[\\&_svg\\]\\:size-4.\\[\\&_svg\\]\\:shrink-0.bg-primary.text-primary-foreground.hover\\:bg-primary\\/90.h-10.px-4.py-2.flex.flex-row.gap-2.items-center', {
                timeout: 1000
            }).catch(() => null);

            if (!button) {
                console.log('✅ No more items to load.');
                break;
            }

            console.log(`🖱️ Clicking Load More (${++clickCount})...`);
            await button.click();

            // Wait for network to be idle with shorter timeout
            await page.waitForNetworkIdle({ timeout: 1000 }).catch(() => {});
        } catch (error) {
            console.error('Error:', error.message);
            break;
        }
    }

    // After all content is loaded, collect all anchor information
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

    console.log(`\n📊 Total number of clicks: ${clickCount}`);
    console.log(`📚 Found ${novels.length} novels`);

    await browser.close();
    return novels;
}

// API endpoint to get novels data
app.get('/api/novels', async (req, res) => {
    try {
        console.log('📡 API request received');
        const novels = await getNovelsData();
        res.json({
            success: true,
            count: novels.length,
            data: novels
        });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
}); 