import axios from "axios"
import Movie from "../models/Movie.js"
import Show from "../models/Show.js"
import Booking from "../models/Booking.js"
import stripe from 'stripe'
//function to check availability of selected seats for a movie
const checkSeatsAvailability = async (showId, selectedSeats) => {
    try {
        // If it's a virtual ID, it's not in DB yet, so all seats are available
        if (showId.startsWith('virtual_')) {
            return true;
        }

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

        let actualShowId = showId;
        let showData;

        // If it's a virtual ID, we need to create the Show in DB first
        if (showId.startsWith('virtual_')) {
            const parts = showId.split('_');
            const movieId = parts[1];
            const timestamp = parseInt(parts[2]);
            const showDateTime = new Date(timestamp);

            // Double check if it was created in the meantime
            showData = await Show.findOne({ movie: movieId, showDateTime });
            
            if (!showData) {
                // Also ensure movie exists
                let movie = await Movie.findById(movieId);
                if (!movie) {
                    // Fetch and create movie if missing
                    const [details, credits] = await Promise.all([
                        axios.get(`https://api.themoviedb.org/3/movie/${movieId}`, {
                            headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` }
                        }),
                        axios.get(`https://api.themoviedb.org/3/movie/${movieId}/credits`, {
                            headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` }
                        })
                    ]);
                    movie = await Movie.create({
                        _id: movieId,
                        title: details.data.title,
                        overview: details.data.overview,
                        poster_path: details.data.poster_path,
                        backdrop_path: details.data.backdrop_path,
                        genres: details.data.genres,
                        casts: credits.data.cast,
                        release_date: details.data.release_date,
                        vote_average: details.data.vote_average,
                        runtime: details.data.runtime,
                        tagline: details.data.tagline || "",
                        original_language: details.data.original_language
                    });
                }

                showData = await Show.create({
                    movie: movieId,
                    showDateTime,
                    showPrice: 50,
                    occupiedSeats: {}
                });
            }
            actualShowId = showData._id;
        } else {
            //detail show
            showData = await Show.findById(showId).populate('movie');
        }

        if (!showData) {
            return res.json({success:false, message: "Show not found"});
        }

        //create new booking 
        const booking = await Booking.create({
            user:userId,
            show:actualShowId,
            amount:showData.showPrice*selectedSeats.length,
            bookedSeats:selectedSeats
        })
        selectedSeats.map((seat)=>{
            showData.occupiedSeats[seat] = userId; 
        })
        showData.markModified('occupiedSeats');
        await showData.save();

        //stripe gateway initialize
        const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY)

        //creating line items to for stripe
        const line_items = [{
            price_data:{
                currency:'usd',
                product_data:{
                    name:showData.movie.title
                },
                unit_amount:Math.floor(booking.amount)*100
            },
            quantity:1
        }]

        const session = await stripeInstance.checkout.sessions.create({
            success_url:`${origin}/loading/my-bookings`,
            cancel_url:`${origin}/my-bookings`,
            line_items:line_items,
            node:'payment',
            metadata:{
                bookingId:booking._id.toString()

            },
            //Expires in 5 minutes
            expires_at:Math.floor(Date.now()/1000)+5*60
        })
        booking.paymentLink = session.url
        await booking.save()
        res.json({success:true,url:session.url});
    } catch (error) {
        console.log(error);
        res.json({success:false,message:error.message});
    }
}

export const getOccupiedSeats = async (req,res) => {
    try {
        const {showId} = req.params;
        
        // If it's a virtual ID, no seats are occupied yet
        if (showId.startsWith('virtual_')) {
            return res.json({success:true, occupiedSeats: []});
        }

        const showData = await Show.findById(showId)
        if (!showData) {
             return res.json({success:true, occupiedSeats: []});
        }

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