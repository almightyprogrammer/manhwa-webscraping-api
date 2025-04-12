const puppeteer = require('puppeteer');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');

const app = express();
const startPort = 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Function to delay execution
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Create downloads directory if it doesn't exist
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir);
}

async function mergeImagesToPDF(images, outputPath) {
    console.log('📄 Starting PDF merge process...');
    console.log(`Number of images to merge: ${images.length}`);
    console.log(`Output PDF path: ${outputPath}`);
    
    const pdfDoc = await PDFDocument.create();
    
    for (const imagePath of images) {
        try {
            console.log(`Processing image: ${imagePath}`);
            
            // Read the image file
            const imageBytes = fs.readFileSync(imagePath);
            console.log(`Image size: ${imageBytes.length} bytes`);
            
            // Convert image to JPEG if needed using sharp
            const processedImage = await sharp(imageBytes)
                .jpeg({ quality: 100 })
                .toBuffer();
            
            // Get image dimensions
            const metadata = await sharp(processedImage).metadata();
            console.log(`Image dimensions: ${metadata.width}x${metadata.height}`);
            
            // Create a new page with the image dimensions
            const page = pdfDoc.addPage([metadata.width, metadata.height]);
            
            // Embed the JPEG image
            const jpgImage = await pdfDoc.embedJpg(processedImage);
            
            // Draw the image on the page
            page.drawImage(jpgImage, {
                x: 0,
                y: 0,
                width: metadata.width,
                height: metadata.height,
            });
            
            console.log(`✅ Added panel to PDF: ${path.basename(imagePath)}`);
        } catch (error) {
            console.error(`❌ Error processing image ${imagePath}:`, error);
            throw error;
        }
    }
    
    try {
        // Save the PDF
        console.log('Saving PDF...');
        const pdfBytes = await pdfDoc.save();
        fs.writeFileSync(outputPath, pdfBytes);
        console.log(`✅ PDF saved successfully to: ${outputPath}`);
        
        // Verify the PDF was created
        if (fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            console.log(`PDF file size: ${stats.size} bytes`);
        } else {
            console.error('❌ PDF file was not created!');
        }
    } catch (error) {
        console.error('❌ Error saving PDF:', error);
        throw error;
    }
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
        
        // Set a user agent to look more like a regular browser
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        
        // Block unnecessary resources to improve performance
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const resourceType = request.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                request.abort();
            } else {
                request.continue();
            }
        });

        console.log('🌐 Navigating to Reaper Scans comics page...');
        await page.goto('https://reaperscans.com/comics', { 
            waitUntil: 'domcontentloaded',
            timeout: 15000
        });

        // Wait for the initial content to load
        await page.waitForSelector('div.grid.grid-cols-1.lg\\:grid-cols-2.gap-2', { timeout: 5000 });

        let clickCount = 0;
        console.log('🔄 Starting to click Load More button...');

        while (true) {
            try {
                const button = await page.waitForSelector('button.justify-center.whitespace-nowrap.rounded-md.text-sm.font-medium.ring-offset-background.transition-colors.focus-visible\\:outline-none.focus-visible\\:ring-2.focus-visible\\:ring-ring.focus-visible\\:ring-offset-2.disabled\\:pointer-events-none.disabled\\:opacity-50.\\[\\&_svg\\]\\:pointer-events-none.\\[\\&_svg\\]\\:size-4.\\[\\&_svg\\]\\:shrink-0.bg-primary.text-primary-foreground.hover\\:bg-primary\\/90.h-10.px-4.py-2.flex.flex-row.gap-2.items-center', {
                    timeout: 1000
                }).catch(() => null);

                if (!button) {
                    console.log('✅ No more items to load.');
                    break;
                }

                console.log(`🖱️ Clicking Load More (${++clickCount})...`);
                await button.click();
                await delay(1000); // Add delay between clicks to be respectful
                await page.waitForNetworkIdle({ timeout: 1000 }).catch(() => {});
            } catch (error) {
                console.error('Error:', error.message);
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

        console.log(`\n📊 Total number of clicks: ${clickCount}`);
        console.log(`📚 Found ${comics.length} comics`);

        return comics;
    } catch (error) {
        console.error('Scraping error:', error);
        throw error;
    } finally {
        await browser.close();
    }
}

async function downloadChapterPanels(chapterUrl) {
    // Extract chapter number from URL
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
        
        // Set a user agent to look more like a regular browser
        await browserPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        console.log('🌐 Navigating to chapter page...');
        await browserPage.goto(chapterUrl, { 
            waitUntil: 'domcontentloaded',
            timeout: 15000
        });

        // Wait for the images to load
        await browserPage.waitForSelector('img[src*="reaperscans.com"]', { timeout: 5000 });

        // Get all panel images
        const panels = await browserPage.evaluate(() => {
            const images = document.querySelectorAll('img[src*="reaperscans.com"]');
            return Array.from(images).map(img => ({
                src: img.src,
                alt: img.alt || 'Panel'
            }));
        });

        console.log(`Found ${panels.length} panels to process`);

        // Create PDF document
        const pdfDoc = await PDFDocument.create();
        
        // Process each panel and add to PDF
        for (let i = 0; i < panels.length; i++) {
            const panel = panels[i];
            try {
                console.log(`Processing panel ${i + 1}/${panels.length}`);
                
                // Download the image directly
                const response = await browserPage.goto(panel.src);
                const imageBuffer = await response.buffer();
                
                // Process image with sharp
                const processedImage = await sharp(imageBuffer)
                    .jpeg({ quality: 100 })
                    .toBuffer();
                
                // Get image dimensions
                const metadata = await sharp(processedImage).metadata();
                
                // Create a new page with the image dimensions
                const pdfPage = pdfDoc.addPage([metadata.width, metadata.height]);
                
                // Embed the JPEG image
                const jpgImage = await pdfDoc.embedJpg(processedImage);
                
                // Draw the image on the page
                pdfPage.drawImage(jpgImage, {
                    x: 0,
                    y: 0,
                    width: metadata.width,
                    height: metadata.height,
                });
                
                console.log(`✅ Added panel ${i + 1} to PDF`);
                await delay(500); // Be respectful with requests
            } catch (error) {
                console.error(`Error processing panel ${i + 1}:`, error);
                throw error;
            }
        }

        // Create downloads directory if it doesn't exist
        if (!fs.existsSync(downloadsDir)) {
            fs.mkdirSync(downloadsDir);
        }

        // Save the PDF with chapter number
        const pdfPath = path.join(downloadsDir, `chapter_${chapterNumber}.pdf`);
        console.log('Saving PDF...');
        const pdfBytes = await pdfDoc.save();
        fs.writeFileSync(pdfPath, pdfBytes);
        
        // Verify the PDF was created
        if (fs.existsSync(pdfPath)) {
            const stats = fs.statSync(pdfPath);
            console.log(`✅ PDF created successfully: ${stats.size} bytes`);
        } else {
            throw new Error('PDF file was not created');
        }

        return {
            success: true,
            message: `Created PDF with ${panels.length} panels`,
            pdfPath: pdfPath
        };
    } catch (error) {
        console.error('Download error:', error);
        throw error;
    } finally {
        await browser.close();
    }
}

// API endpoint to get comics data
app.get('/api/comics', async (req, res) => {
    try {
        console.log('📡 API request received');
        const comics = await getComicsData();
        res.json({
            success: true,
            count: comics.length,
            data: comics
        });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API endpoint to download chapter panels
app.post('/api/download-chapter', async (req, res) => {
    try {
        const { chapterUrl } = req.body;
        
        if (!chapterUrl) {
            return res.status(400).json({
                success: false,
                error: 'Chapter URL is required'
            });
        }

        console.log('📡 Download request received');
        const result = await downloadChapterPanels(chapterUrl);
        res.json(result);
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Test PDF endpoint
app.post('/api/test-pdf', async (req, res) => {
    try {
        const testDir = path.join(downloadsDir, 'test_pdf');
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir);
        }

        // Create a test image
        const imagePath = path.join(testDir, 'test.jpg');
        await sharp({
            create: {
                width: 800,
                height: 600,
                channels: 3,
                background: { r: 255, g: 0, b: 0 }
            }
        })
        .jpeg()
        .toFile(imagePath);

        // Create PDF
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
            pdfPath: pdfPath
        });
    } catch (error) {
        console.error('Test PDF creation error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Start the server with port fallback
function startServer(port) {
    app.listen(port, () => {
        console.log(`🚀 Server running at http://localhost:${port}`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`Port ${port} is in use, trying port ${port + 1}`);
            startServer(port + 1);
        } else {
            console.error('Server error:', err);
        }
    });
}

// Start the server
startServer(startPort);