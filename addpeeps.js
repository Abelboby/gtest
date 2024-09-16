const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs').promises; // For file operations
const path = require('path'); // For handling file paths

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: true,
    }
});

// The authorized number that can add members (include country code)
const AUTHORIZED_NUMBER = ['120363317523691624@g.us','120363335216123488@g.us','120363285085188422@g.us'];

// File to store numbers that couldn't be added
const FAILED_NUMBERS_FILE = 'failed_numbers.txt';

client.initialize();

client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
});

client.on('ready', () => {
    console.log('Client is ready!');
});

// Function to append numbers to the file
async function appendToFile(numbers) {
    try {
        const filePath = path.join(__dirname, FAILED_NUMBERS_FILE);
        
        // Read existing content
        let existingContent = '';
        try {
            existingContent = await fs.readFile(filePath, 'utf8');
        } catch (error) {
            // File doesn't exist yet, which is fine
        }

        // Append new numbers, ensuring each is on a new line
        const newContent = numbers.reduce((acc, num) => {
            if (!existingContent.includes(num)) {
                return acc + num + '\n';
            }
            return acc;
        }, existingContent);

        // Write back to file
        await fs.writeFile(filePath, newContent);
        console.log('Failed numbers updated in file');
    } catch (error) {
        console.error('Error writing to file:', error);
    }
}

client.on('message', async (msg) => {
    console.log(msg.body,msg.from);
    if (msg.body.startsWith('!addmembers')) {
        // Check if the sender is authorized
        if (!AUTHORIZED_NUMBER.includes(msg.from)) {
            msg.react('❌');
            return;
        }

        const chat = await msg.getChat();
        
        if (chat.isGroup) {
            // Extract phone numbers from the message
            // const numbersToAdd = msg.body.split(' ').slice(1);
            const numbersToAdd = msg.body.split(/\s+/).slice(1); // Split by any whitespace (spaces, new lines, etc.)            
            
            // Format numbers, add country code if needed, and filter out any invalid ones
            const formattedNumbers = numbersToAdd
                .map(num => {
                    // Remove any non-digit characters
                    num = num.replace(/\D/g, '');
                    // Add country code if it's not present
                    if (!num.startsWith('91')) {
                        num = '91' + num;
                    }
                    return `${num}@c.us`;
                })
                .filter(num => num.match(/^91\d{10}@c.us$/)); // Ensure number is valid (91 + 10 digits)

            if (formattedNumbers.length > 0) {
                try {
                    const result = await chat.addParticipants(formattedNumbers);
                    // console.log(result);

                    let response = 'Results of adding members:\n';
                    const failedNumbers = [];
                    for (const [number, status] of Object.entries(result)) {
                        // Extract only the 10-digit number for display
                        const displayNumber = number.slice(-15, -5);
                        const success = status.code === 200;
                        response += `${displayNumber}: ${success ? 'Added successfully' : status.message}\n`;
                        
                        if (!success && status.message.includes('private invitation')) {
                            failedNumbers.push(displayNumber);
                        }
                    }
                    // msg.reply(response);
                    console.log(response);
                    msg.react('✅');
                    // Append failed numbers to file
                    if (failedNumbers.length > 0) {
                        await appendToFile(failedNumbers);
                    }
                } catch (error) {
                    console.error('Error adding members:', error);
                    console.log('An error occurred while adding members.');
                }
            } else {
                console.log('No valid phone numbers provided. Please use the format: !addmembers number1 number2 number3');
            }
        } else {
            console.log('This command can only be used in a group chat.');
        }
    }
});

client.on('disconnected', (reason) => {
    console.log('Client was logged out', reason);
});