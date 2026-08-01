import mongoose from "mongoose";

const movieSchema = new mongoose.Schema(
    {
        _id:{type:String,required:true},
        title:{type:String,required:true},
        overview:{type:String,required:true},
        poster_path:{type:String,required:true},
        backdrop_path:{type:String,required:true},
        release_date:{type:String,required:true},
        original_language:{type:String},
        tagline:{type:String},
        genres:{type:Array,required:true},
        casts:{type:Array,required:true},
        vote_average:{type:Number,required:true},
        vote_count:{type:Number,min:0,default:0},
        popularity:{type:Number,min:0,default:0},
        adult:{type:Boolean,default:false},
        runtime:{type:Number,required:true},
        heroVideoId: { type: String, default: "" },
        heroVideoPublicId: { type: String, default: "" },
        heroVideoStorageProvider: { type: String, default: "" },
        heroVideoStorageId: { type: String, default: "" },
        heroVideoMovieId: { type: String, default: "" },
        heroVideoUrl: { type: String, default: "" },
        heroVideoMimeType: { type: String, default: "" },
        heroVideoPosterUrl: { type: String, default: "" },
        heroVideoStatus: { type: String, default: "" },
        heroVideoVersion: { type: String, default: "" },
        heroVideoDuration: { type: Number, min: 0, default: 0 },
        heroVideoWidth: { type: Number, min: 0, default: 0 },
        heroVideoHeight: { type: Number, min: 0, default: 0 },
        heroVideoBytes: { type: Number, min: 0, default: 0 },
        heroVideoCodec: { type: String, default: "" },
        heroVideoVerifiedAt: { type: Date, default: null },
        heroVideoSource: { type: String, default: "" },
        heroVideoAttribution: { type: mongoose.Schema.Types.Mixed, default: null },
        heroVideoChecksum: { type: String, default: "" },
    },{timestamps:true}
)
const Movie = mongoose.model('Movie', movieSchema);
export default Movie;
