// chore: Utility function to format duration in minutes to readable format
const timeFormat = (minutes) => {
    // guard against missing or invalid input
    if (minutes == null || isNaN(Number(minutes))) return 'N/A';
    // feat: Convert minutes to hours and remaining minutes
    const h = Math.floor(Number(minutes) / 60);
    const m = Number(minutes) % 60;
    return `${h}h ${m}m`;
}

export default timeFormat;