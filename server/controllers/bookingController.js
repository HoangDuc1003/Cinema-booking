import Show from "../models/Show"
import Booking from "../models/Booking"

//function to check availability of selected seats for a movie
const checkSeatsAvailability = async (showId, selectedSeats) => {
    try {
        const showData = await Show.findById(showId)
        if (!showData) return false;
        const occupiedSeats = showData.occupiedSeats;
        const isAnySeatTaken = selectedSeats.some(seat=>occupiedSeats[seat]);
        return !isAnySeatTaken;
    } catch (error) {
        console.log(error.message);
        return false;
    }
}

export const createBooking = async (req,res) =>{
    try {
        const {userId} = req.auth();
        const {showId,selectedSeats} = req.body;
        const {origin} = req.headers;

        //check if the seat is available for the selected show
        const isAvailable = await checkSeatsAvailability(showId, selectedSeats)

        if (!isAvailable) {
            return res.json({success:false,message:"Selected seats are not available"});
        }
        //detail show
        const showData = await Show.findById(showId).populate('movie');
        //create new booking 
        const booking = await Booking.create({
            user:userId,
            show:showId,
            amount:showData.showPrice*selectedSeats.length,
            bookedSeats:selectedSeats
        })
        selectedSeats.map((seat)=>{
            showData.occupiedSeats[seat] = userId; 
        })
        showData.markModified('occupiedSeats');
        await showData.save();

        //stripe gateway initialize
        res.json({success:true,message:""})
    } catch (error) {
        
    }
}