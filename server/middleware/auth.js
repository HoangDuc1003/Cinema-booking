import {clerkClient} from "@clerk/express";

export const protectAdmin = async (req,res,next) => {
    try {
        // req.auth() returns the auth state when using @clerk/express v2+
        const { userId } = req.auth();
        if (!userId) {
            return res.json({success:false,message:"Not authorized"});
        }
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