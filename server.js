const puppeteer = require('puppeteer');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');

const app = express();
const startPort = 3000;

app.use(cors());
app.use(express.json());

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir);
}

async function mergeImagesToPDF(images, outputPath) {
    const pdfDoc = await PDFDocument.create();
    for (const imagePath of images) {
        const imageBytes = fs.readFileSync(imagePath);
        const processedImage = await sharp(imageBytes).jpeg({ quality: 100 }).toBuffer();
        const metadata = await sharp(processedImage).metadata();
        const page = pdfDoc.addPage([metadata.width, metadata.height]);
        const jpgImage = await pdfDoc.embedJpg(processedImage);
        page.drawImage(jpgImage, {
            x: 0,
            y: 0,
            width: metadata.width,
            height: metadata.height,
        });
    }
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);
}

async function getComicsData() {
    const browser = await puppeteer.launch({ 
        headless: "new",
        defaultViewport: { width: 1920, height: 1080 },
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu'
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(15000);
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const resourceType = request.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                request.abort();
            } else {
                request.continue();
            }
        });

        await page.goto('https://reaperscans.com/comics', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForSelector('div.grid.grid-cols-1.lg\\:grid-cols-2.gap-2', { timeout: 5000 });

        while (true) {
            try {
                const button = await page.waitForSelector('button.justify-center.whitespace-nowrap.rounded-md.text-sm.font-medium.ring-offset-background.transition-colors.focus-visible\\:outline-none.focus-visible\\:ring-2.focus-visible\\:ring-ring.focus-visible\\:ring-offset-2.disabled\\:pointer-events-none.disabled\\:opacity-50.\\[\\&_svg\\]\\:pointer-events-none.\\[\\&_svg\\]\\:size-4.\\[\\&_svg\\]\\:shrink-0.bg-primary.text-primary-foreground.hover\\:bg-primary\\/90.h-10.px-4.py-2.flex.flex-row.gap-2.items-center', {
                    timeout: 1000
                }).catch(() => null);
                if (!button) break;
                await button.click();
                await delay(1000);
                await page.waitForNetworkIdle({ timeout: 1000 }).catch(() => {});
            } catch {
                break;
            }
        }

        const comics = await page.evaluate(() => {
            const gridDiv = document.querySelector('div.grid.grid-cols-1.lg\\:grid-cols-2.gap-2');
            if (!gridDiv) return [];
            const anchors = gridDiv.querySelectorAll('a');
            return Array.from(anchors).map(anchor => {
                const titleElement = anchor.querySelector('h1.text-foreground.font-bold.text-lg.line-clamp-1');
                const statusElement = anchor.querySelector('div.text-muted-foreground.text-sm');
                const imageElement = anchor.querySelector('img');
                return {
                    href: anchor.href,
                    title: titleElement ? titleElement.textContent.trim() : anchor.title || anchor.textContent.trim(),
                    status: statusElement ? statusElement.textContent.trim() : 'Unknown',
                    imageUrl: imageElement ? imageElement.src : null,
                    content: anchor.textContent.trim()
                };
            });
        });

        return comics;
    } finally {
        await browser.close();
    }
}

async function downloadChapterPanels(chapterUrl) {
    const chapterMatch = chapterUrl.match(/chapter-(\d+)/);
    const chapterNumber = chapterMatch ? chapterMatch[1] : 'unknown';

    const browser = await puppeteer.launch({ 
        headless: "new",
        defaultViewport: { width: 1920, height: 1080 },
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu'
        ]
    });

    try {
        const browserPage = await browser.newPage();
        await browserPage.setDefaultNavigationTimeout(15000);
        await browserPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        await browserPage.goto(chapterUrl, { waitUntil: 'networkidle0', timeout: 30000 });

        try {
            await browserPage.waitForSelector('img[src*="reaperscans.com"]', { timeout: 10000, visible: true });
        } catch {}

        const panels = await browserPage.evaluate(() => {
            const images = document.querySelectorAll('img[src*="reaperscans.com"]');
            return Array.from(images).map(img => ({
                src: img.src,
                alt: img.alt || 'Panel'
            }));
        });

        if (panels.length === 0) {
            throw new Error('No panels found on the page.');
        }

        const pdfDoc = await PDFDocument.create();

        for (let i = 0; i < panels.length; i++) {
            const panel = panels[i];
            const response = await browserPage.goto(panel.src);
            const imageBuffer = await response.buffer();
            const processedImage = await sharp(imageBuffer).jpeg({ quality: 100 }).toBuffer();
            const metadata = await sharp(processedImage).metadata();
            const pdfPage = pdfDoc.addPage([metadata.width, metadata.height]);
            const jpgImage = await pdfDoc.embedJpg(processedImage);
            pdfPage.drawImage(jpgImage, {
                x: 0,
                y: 0,
                width: metadata.width,
                height: metadata.height,
            });
            await delay(500);
        }

        const pdfBytes = await pdfDoc.save();

        return {
            success: true,
            message: `Created PDF with ${panels.length} panels`,
            pdfBytes,
            filename: `chapter_${chapterNumber}.pdf`
        };
    } finally {
        await browser.close();
    }
}

app.get('/api/comics', async (req, res) => {
    try {
        const comics = await getComicsData();
        res.json({
            success: true,
            count: comics.length,
            data: comics
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/download-chapter', async (req, res) => {
    try {
        const { chapterUrl } = req.body;
        if (!chapterUrl) {
            return res.status(400).json({
                success: false,
                error: 'Chapter URL is required'
            });
        }

        const result = await downloadChapterPanels(chapterUrl);

        if (result.success) {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
            res.send(result.pdfBytes);
        } else {
            res.status(500).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/test-pdf', async (req, res) => {
    try {
        const testDir = path.join(downloadsDir, 'test_pdf');
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir);
        }

        const imagePath = path.join(testDir, 'test.jpg');
        await sharp({
            create: {
                width: 800,
                height: 600,
                channels: 3,
                background: { r: 255, g: 0, b: 0 }
            }
        }).jpeg().toFile(imagePath);

        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([800, 600]);
        const imageBytes = fs.readFileSync(imagePath);
        const jpgImage = await pdfDoc.embedJpg(imageBytes);
        page.drawImage(jpgImage, {
            x: 0,
            y: 0,
            width: 800,
            height: 600,
        });

        const pdfPath = path.join(testDir, 'test.pdf');
        const pdfBytes = await pdfDoc.save();
        fs.writeFileSync(pdfPath, pdfBytes);

        res.json({
            success: true,
            message: 'Test PDF created successfully',
            pdfPath
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

function startServer(port) {
    app.listen(port, () => {}).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            startServer(port + 1);
        } else {
            process.exit(1);
        }
    });
}

startServer(startPort);
