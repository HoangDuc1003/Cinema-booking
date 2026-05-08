import {Inngest} from 'inngest';
import User from '../models/User.js';
// create a client to send and receive events
export const inngest = new Inngest({id:"Cinema-booking"});
//inngest functions to save uses data to DataBase
const syncUserCreation = inngest.createFunction(
    {
        id: 'sync-user-from-clerk' ,
        triggers:[{ event: 'clerk/user.created' }]
    },
    async ({event}) =>{
        const {id,first_name,last_name,email_address,image_url} = event.data
        const userData = {
            _id:id,
            email:email_address[0].email_address,
            name:first_name+' '+last_name,
            image:image_url
        }
        await User.create(userData)
    }
)
//inngest functions to delete uses from DataBase
const syncUserDeletion = inngest.createFunction(
    {
        id: 'delete-user-with-clerk' ,
        triggers:[{ event: 'clerk/user.deleted' }]
    },
    async ({event}) =>{
        const{id} = event.data
        await User.findByIdAndDelete(id)
    }
)
//inngest functions to update uses from DataBase
const syncUsersyncUserUpdation = inngest.createFunction(
    {
        id: 'update-user-from-clerk' ,
        triggers:[{ event: 'clerk/user.updated' }]
    },
    async ({event}) =>{
        const {id,first_name,last_name,email_address,image_url} = event.data
        const userData = {
            _id:id,
            email:email_address[0].email_address,
            name:first_name+' '+last_name,
            image:image_url
        }
        await User.findByIdAndUpdate(id,userData)
    }
)

//create an empty array where we'll export future inngest functions
export const functions =[
    syncUserCreation,
    syncUserDeletion,
    syncUsersyncUserUpdation
];