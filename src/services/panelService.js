const puppeteer = require('puppeteer');
const sharp = require('sharp');
const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;
const config = require('../config/config');

class PanelService {
    constructor() {
        this.config = config;
        this.tempDir = path.join(__dirname, '../../temp');
    }

    async ensureTempDir() {
        try {
            await fs.access(this.tempDir);
        } catch {
            await fs.mkdir(this.tempDir, { recursive: true });
        }
    }

    async downloadImage(url, filename) {
        const response = await axios({ url, responseType: 'arraybuffer' });
        const imagePath = path.join(this.tempDir, filename);
        await fs.writeFile(imagePath, response.data);
        return imagePath;
    }

    async getPanelUrls(page) {
        return await page.evaluate(() => {
            const panels = Array.from(document.querySelectorAll('img[class*="panel"]'));
            return panels.map(panel => panel.src);
        });
    }

    async mergePanels(panelPaths) {
        const outputPath = path.join(this.tempDir, 'merged.png');
        const firstPanel = await sharp(panelPaths[0]).metadata();
        const width = firstPanel.width;

        let totalHeight = 0;
        const panelHeights = [];

        for (const panelPath of panelPaths) {
            const metadata = await sharp(panelPath).metadata();
            panelHeights.push(metadata.height);
            totalHeight += metadata.height;
        }

        const composite = sharp({
            create: {
                width,
                height: totalHeight,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            }
        });

        const composites = panelPaths.map((panelPath, index) => ({
            input: panelPath,
            top: panelHeights.slice(0, index).reduce((a, b) => a + b, 0),
            left: 0
        }));

        await composite.composite(composites).toFile(outputPath);
        return outputPath;
    }

    async cleanup(panelPaths, mergedPath) {
        try {
            for (const panelPath of panelPaths) {
                await fs.unlink(panelPath);
            }
            await fs.unlink(mergedPath);
        } catch {}
    }

    async scrapeAndMergePanels(url) {
        await this.ensureTempDir();
        const browser = await puppeteer.launch(this.config.puppeteer.options);
        const page = await browser.newPage();

        try {
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
            const panelUrls = await this.getPanelUrls(page);
            if (!panelUrls.length) throw new Error('No panels found on the page');

            const panelPaths = [];
            for (let i = 0; i < panelUrls.length; i++) {
                const panelPath = await this.downloadImage(panelUrls[i], `panel-${i}.png`);
                panelPaths.push(panelPath);
            }

            const mergedPath = await this.mergePanels(panelPaths);
            const mergedImage = await fs.readFile(mergedPath);

            await this.cleanup(panelPaths, mergedPath);
            await browser.close();

            return mergedImage;
        } catch (error) {
            await browser.close();
            throw error;
        }
    }
}

module.exports = new PanelService();
