const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const http = require('http');
const socketio = require('socket.io');
const socketioClient = require('socket.io-client');

const token = process.env.TG_TOKEN;
const urlAPIWhether = 'https://api.openweathermap.org/data/2.5/forecast';
const urlAPIFoundCity = 'http://api.openweathermap.org/geo/1.0/direct';
const hostingUrl = process.env.HOSTING_URL;
const apiKey = process.env.WEATHER_API_KEY;
const PORT = process.env.PORT || 3000;

const userCity = {};

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('Server is running\n');
})

const io = socketio(server);
const ioClient = socketioClient(hostingUrl);

setInterval(() => {
    console.log("Sending awake request!");

    ioClient.emit('keepAlive', { message: 'Server is alive!' });
}, 300000);


io.on('connection', (socket) => {
    console.log('A client connected');

    socket.on('keepAlive', (data) => {
        console.log('Keep alive message received:', data);
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

const bot = new TelegramBot(token, { polling: true });
console.log('Telegram bot successfully started...\n');

bot.onText(/\/start|Оновити місто/, (msg) => {
    const chatId = msg.chat.id;
    userCity[chatId] = {};
    askForCity(chatId);
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const city = msg.text;

    if (userCity[chatId] && userCity[chatId].waitingForCity) {
        userCity[chatId].city = city;
        userCity[chatId].waitingForCity = false;
        await sendWeatherMenuKeyboard(chatId, city);
    }
});

bot.onText(/Погода в місті (.+)$/, async (msg) => {
    const chatId = msg.chat.id;
    sendIntervals(chatId);
});

bot.onText(/З 3-годинним інтервалом|З 6-годинним інтервалом/, async (msg) => {
    const chatId = msg.chat.id;
    const interval = msg.text;
    const city = userCity[chatId].city;
    try {
        const cityCoords = await getLatitudeAndLongitude(city);

        if (cityCoords === null) {
            sendTextMessage(chatId, `Місто не знайдено: ${city}`);
            return;
        }

        const weather = await getWeather(cityCoords.lat, cityCoords.lon);

        let weatherDataArr = weather.list;
        if (interval === 'З 6-годинним інтервалом') {
            weatherDataArr = [];
            for (let index = 0; index < weather.list.length; index += 2) {
                const element = weather.list[index];
                weatherDataArr.push(element);
            }
        }
        await sendTextMessage(chatId, `Прогноз погоди в ${city}:\n${formatWeather(weatherDataArr)}`);
        await sendIntervals(chatId);
    } catch (error) {
        console.error(error)
        sendTextMessage(chatId, `Виникла помилка на сервері!`);
    };
})

bot.on("polling_error", console.log);

const askForCity = (chatId) => {
    userCity[chatId].waitingForCity = true;
    bot.sendMessage(chatId, 'Введіть місто');
};

async function getWeather(lat, lon) {
    return axios({
        url: urlAPIWhether,
        method: 'GET',
        params: {
            lat: lat,
            lon: lon,
            appid: apiKey,
            units: 'metric',
            lang: 'ua'
        },
        responseType: 'json',
    })
        .then((response) => response.data)
        .catch((error) => {
            throw new Error("Виникла помилка отримання інформації про погоду в місті!", error)
        });
}

async function getLatitudeAndLongitude(city) {
    const data = await axios({
        url: urlAPIFoundCity,
        method: 'GET',
        params: {
            q: city,
            limit: 1,
            appid: apiKey
        },
        responseType: 'json',
    })
        .then((response) => response.data)
        .catch((error) => {
            throw new Error("Виникла помилка отримання даних про місто!", error)
        });

    if (data && data.length) {
        return {
            lat: data[0].lat,
            lon: data[0].lon
        };
    }

    return null;
}

async function sendTextMessage(chatId, text) {
    return bot.sendMessage(chatId, text);
}

async function sendWeatherMenuKeyboard(chatId, city) {
    return bot.sendMessage(chatId, 'Натисніть на меню', {
        reply_markup: {
            keyboard: [
                [`Погода в місті ${city}`]
            ],
            resize_keyboard: true
        }
    });
}

async function sendIntervals(chatId) {
    return bot.sendMessage(chatId, 'Оберіть інтервал', {
        reply_markup: {
            keyboard: [
                ['З 3-годинним інтервалом', 'З 6-годинним інтервалом'],
                ['Оновити місто']
            ],
            resize_keyboard: true
        }
    });
}

function formatWeather(weatherDataArr) {
    let result = '';
    let currentDate = null;

    for (let index = 0; index < weatherDataArr.length; index++) {
        const weather = weatherDataArr[index];
        const date = new Date(weather.dt * 1000);
        const formattedDate = toFormattedDate(date);
        if (currentDate !== formattedDate) {
            result += `\n${formattedDate}:\n`;
        }
        currentDate = formattedDate;
        const hour = toFormattedHours(date);
        const temperature = Math.round(weather.main.temp);
        const temperatureCheckMark = temperature > 0 ? `+${temperature}` : temperature;
        const temperatureFeelsLike = Math.round(weather.main.feels_like);
        const temperatureFeelsLikeCheckMark = temperatureFeelsLike > 0 ? `+${temperatureFeelsLike}` : temperatureFeelsLike;
        const weatherDescription = weather.weather[0].description;

        result += `\t\t\t${hour} ${temperatureCheckMark}°C, відчувається: ${temperatureFeelsLikeCheckMark}°C,  ${weatherDescription}\n`;
    }
    return result;
}

function toFormattedDate(date) {
    const daysOfWeek = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П\'ятниця', 'Субота'];
    const months = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];

    const dayOfWeek = daysOfWeek[date.getDay()];
    const dayOfMonth = date.getDate();
    const monthName = months[date.getMonth()];

    return `${dayOfWeek}, ${dayOfMonth} ${monthName}`;
}

function toFormattedHours(date) {
    const hour = date.getHours();
    const formattedHour = hour < 10 ? `0${hour}` : hour;
    return `${formattedHour}:00`;
}