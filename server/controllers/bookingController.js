import Show from "../models/Show.js"
import Booking from "../models/Booking.js"

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
        res.json({success:true,message:"Booked successfully"});
    } catch (error) {
        console.log(error);
        res.json({success:false,message:error.message});
    }
}

export const getOccupiedSeats = async (req,res) => {
    try {
        const {showId} = req.params;
        const showData = await Show.findById(showId)

        const occupiedSeats = Object.keys(showData.occupiedSeats)

        res.json({success:true,occupiedSeats});
    } catch (error) {
        console.log(error);
        res.json({success:false,message:error.message});
    }
}

export const getUserBookings = async (req, res) => {
    try {
        const { userId } = req.auth();
        const bookings = await Booking.find({ user: userId })
            .populate({
                path: 'show',
                populate: { path: 'movie' }
            })
            .sort({ createdAt: -1 });
        res.json({ success: true, bookings });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}