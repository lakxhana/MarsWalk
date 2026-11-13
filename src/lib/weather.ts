import data from './verifiedWeather.json';
export const WEATHER_SOURCE='https://mars.nasa.gov/rss/api/?feed=weather&category=mars2020&feedtype=json';
const valid=data.sols.filter(s=>typeof s.min_temp==='number'&&typeof s.max_temp==='number');
export const JEZERO_WEATHER=valid[valid.length-1];
export const weatherRange=()=>`${JEZERO_WEATHER.min_temp} to ${JEZERO_WEATHER.max_temp} °C`;
