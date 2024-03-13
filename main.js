const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const token = "";
const chatId = 0;
const urlAPIWhether = 'https://api.openweathermap.org/data/2.5/forecast';
const urlAPIFoundCity = 'http://api.openweathermap.org/geo/1.0/direct';
const apiKey = '';

const bot = new TelegramBot(token, { polling: true });

console.log('Telegram bot successfully started...\n');

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const city = msg.text;

    bot.sendMessage(chatId, `Прогноз погоди в ${city}:`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'З 3-годинним інтервалом', callback_data: '3hourInterval' }],
                [{ text: 'З 6-годинним інтервалом', callback_data: '6hourInterval' }]
            ]
        }
    });
});

bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const interval = callbackQuery.data;
    const city = callbackQuery.message.text.replace('Прогноз погоди в ', '').replace(':', '');

    const cityCoords = await getLatitudeAndLongitude(city);
    const response = await getWeather(cityCoords.lat, cityCoords.lon);

    let weatherDataArr = response.data.list;
    if (interval === '6hourInterval') {
        weatherDataArr = [];
        for (let index = 0; index < response.data.list.length; index += 2) {
            const element = response.data.list[index];
            weatherDataArr.push(element);
        }
    }
    sendTextMessage(chatId, `Прогноз погоди в ${city}:\n${formatWeather(weatherDataArr)}`);
})

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
    });
}

async function getLatitudeAndLongitude(city) {
    const response = await axios({
        url: urlAPIFoundCity,
        method: 'GET',
        params: {
            q: city,
            limit: 1,
            appid: apiKey
        },
        responseType: 'json',
    });

    return {
        lat: response.data[0].lat,
        lon: response.data[0].lon
    };
}

function sendTextMessage(chatId, text) {
    bot.sendMessage(chatId, text);
}

function formatWeather(weatherDataArr) {
    let result = '';
    let currentDate = null;

    for (let index = 0; index < weatherDataArr.length; index++) {
        const weather = weatherDataArr[index];
        const date = new Date(weather.dt * 1000);
        const formattedDate = toFormattedDate(date);
        if (currentDate !== formattedDate) {
            result += `${formattedDate}:\n`;
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