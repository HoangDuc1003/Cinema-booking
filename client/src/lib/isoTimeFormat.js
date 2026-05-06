const isoTimeFormat = (dateTime) => {
    const date = new Date(dateTime);
    const localTime = date.toLocaleDateString('en-US', {hour: '2-digit', minute: '2-digit', hour12: true});
    return localTime;
}
export default isoTimeFormat;