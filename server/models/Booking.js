import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema ({
    user : {type: String , required:true,ref:'User'},
    show : {type: mongoose.Schema.Types.ObjectId , required:true,ref:'Show'},
    amount : {type: Number , required:true},
    bookedSeats : [{type: String , required:true}],
    isPaid : {type: Boolean , default:false},
    status: {type: String, enum: ['pending', 'paid', 'expired'], default: 'pending', index: true},
    holdExpiresAt: {type: Date, required: true, index: true},
    paymentLink : {type: String},
},{timestamps:true})

bookingSchema.index({ user: 1, isPaid: 1, createdAt: -1 });
bookingSchema.index({ show: 1, status: 1 });

const Booking = mongoose.model("Booking",bookingSchema);

export default Booking;
