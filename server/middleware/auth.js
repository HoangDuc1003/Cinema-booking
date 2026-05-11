import {clerkClient} from "@clerk/express";

export const protectAdmin = async (req,res,next) => {
    try {
        const { userId } = req.auth;
        const user = await clerkClient.users.getUser(userId)
        if (user.privateMetadata.role != 'admin'){
            console.log("User is not admin");
            return res.json({success:false,message:"Not authorized"})
        }
        next();

    } catch (error) {
        console.log(error);
        res.json({success:false,message:"Not authorized"});
    }
}