const puppeteer = require('puppeteer');
const config = require('../config/config');

class ScraperService {
    constructor() {
        this.config = config;
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async setupBrowser() {
        const browser = await puppeteer.launch(this.config.puppeteer.options);
        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(this.config.puppeteer.navigationTimeout);

        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const resourceType = request.resourceType();
            if (this.config.blockedResources.includes(resourceType)) {
                request.abort();
            } else {
                request.continue();
            }
        });

        return { browser, page };
    }

    async loadAllContent(page) {
        while (true) {
            try {
                const button = await page.waitForSelector(this.config.selectors.loadMoreButton, {
                    timeout: this.config.puppeteer.buttonTimeout
                }).catch(() => null);

                if (!button) break;

                await button.click();
                await page.waitForNetworkIdle({ 
                    timeout: this.config.puppeteer.networkIdleTimeout 
                }).catch(() => {});
            } catch {
                break;
            }
        }
    }

    async extractNovels(page) {
        return await page.evaluate((selectors) => {
            const gridDiv = document.querySelector(selectors.gridContainer);
            if (!gridDiv) return [];

            const anchors = gridDiv.querySelectorAll('a');
            return Array.from(anchors).map(anchor => {
                const h1 = anchor.querySelector(selectors.title);
                const chaptersSpan = anchor.querySelector(selectors.chapters);
                const chaptersText = chaptersSpan ? chaptersSpan.textContent.trim() : '0';
                const chapters = parseInt(chaptersText) || 0;

                return {
                    href: anchor.href,
                    title: h1 ? h1.textContent.trim() : anchor.title || anchor.textContent.trim(),
                    chapters: chapters
                };
            }).filter(comic => comic.title && comic.href);
        }, this.config.selectors);
    }

    async scrapeComics() {
        const { browser, page } = await this.setupBrowser();

        try {
            await page.goto(this.config.urls.base, { 
                waitUntil: 'domcontentloaded',
                timeout: this.config.puppeteer.navigationTimeout
            });

            await this.loadAllContent(page);
            const novels = await this.extractNovels(page);

            return novels;
        } catch (error) {
            throw error;
        } finally {
            await browser.close();
        }
    }
}

module.exports = new ScraperService();
