// Util: format minutes to "Xh Ym"
const timeFormat = (minutes) => {
    // guard against missing or invalid input
    if (minutes == null || isNaN(Number(minutes))) return 'N/A';
    const h = Math.floor(Number(minutes) / 60);
    const m = Number(minutes) % 60;
    return `${h}h ${m}m`;
}

export default timeFormat;