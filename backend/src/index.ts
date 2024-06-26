import { PrismaClient } from '@prisma/client/edge'
import { withAccelerate } from '@prisma/extension-accelerate'
import { Hono } from 'hono'
import { use } from 'hono/jsx';
import { decode, sign, verify } from 'hono/jwt'
import { cors } from 'hono/cors';
//important in serverless environment variables the routes may be independently deployed. 
//bindings here is used for the c.env.DATABASE_URL type definition
import { signinInput,signupInput,createPostInput,updatePostInput } from '@pu5hp/medium-common';

const app = new Hono<{
  Bindings: {
    DATABASE_URL: string,
    JWT_SECRET:string,
  },Variables : {
		userId: string
	}
}>();
//cors issue handling
app.use('/api/*', cors());
//middle ware to authorize the user for blogs
app.use('/api/v1/blog/*', async (c, next) => {
  //get the header
  //verify the header
  //if the header is correct,we can proceed
  //if not return the user a 403 status code
  //authorization{Bearer token}

  const header = c.req.header("authorization") || ""; //header cannot be undefined so it can be a empty string
  const token = header.split(' ')[1];
  const response = await verify(token,c.env.JWT_SECRET);
  console.log(response);
  if(response.id){
    c.set('userId',response.id)//return user id to the next middleware
    await next()
  }
  c.status(403);
  return c.json({Error:'Not authorized'})
})
//sign-up route
app.post('/api/v1/user/signup',async (c)=>{
  const prisma = new PrismaClient({
    datasourceUrl: c.env.DATABASE_URL,
}).$extends(withAccelerate())
try{
  const body = await c.req.json();
  console.log(body);
  const {success} = signupInput.safeParse(body);
  console.log(success);
  if(!success){
    c.status(403);
    return c.text('wrong inputs');
  }
  const BeforeHash = new TextEncoder().encode(body.password);//in certain format before hashing
  const hashedPassword = await crypto.subtle.digest(
    {
      name: 'SHA-256',
    },
    BeforeHash // The data you want to hash as an ArrayBuffer
  );
  
  var pass = new TextDecoder().decode(hashedPassword);
  
  //returns object
  const user = await prisma.user.create({
    data:{
      email: body.email,
      password: pass,
      name:body.name
    }
  })
  
  const token = await sign({id:user.id},c.env.JWT_SECRET);
    return c.json({ jwt:token});
}
catch(e){
    c.status(411)
    console.log('error:'+e)
    return c.text('Something is wrong')
}
})



//signin route
app.post('/api/v1/user/signin',async (c)=>{

  const prisma = new PrismaClient({
    datasourceUrl: c.env.DATABASE_URL,
}).$extends(withAccelerate())

try{
  const body = await c.req.json();
  //zod check
  const {success} = signinInput.safeParse(body)
  if(!success){
    c.status(411)
    return c.json({'message':'incorrect inputs'})
  }
  const BeforeHash = new TextEncoder().encode(body.password);//in certain format before hashing
  const hashedPassword = await crypto.subtle.digest(
    {
      name: 'SHA-256',
    },
    BeforeHash // The data you want to hash as an ArrayBuffer
  );
  
  var pass = new TextDecoder().decode(hashedPassword);
  //check if the password is same as in user db
  var user = await prisma.user.findUnique({
    where: {
      email: body.email,
      password:pass
    }
  });
  
  if(user===null){
    c.status(403);
    return c.json('User not found')
  }
  const jwt = await sign({id: user.id},c.env.JWT_SECRET);
    return c.json({jwt});
}
catch(e){
c.status(403);
return c.json({'error':"Incorrect LOgin details"})
}
})



//create blog
app.post('/api/v1/blog',async(c)=>{
  const prisma = new PrismaClient({
    datasourceUrl: c.env.DATABASE_URL,
}).$extends(withAccelerate())
try{
  const body = await c.req.json();
  const {success} = createPostInput.safeParse(body);
  if(!success){
    c.status(411)
    return c.json({'message':'incorrect inputs'})
  }
  const userId = c.get('userId');
  //create post in the DB
  const post = await prisma.post.create({
    data:{
      title:body.title,
      content:body.content,
      published:body.published,
      authorId:userId
    }
  })

  return c.json({'create blog user':userId,'postId':post.id});
}
  catch(e){
    c.status(403);
    return c.json({'error':'something is wrong'})
  }
})
//updating the blog
app.put('/api/v1/blog/:pId',async (c)=>{
  const prisma = new PrismaClient({
    datasourceUrl: c.env.DATABASE_URL,
}).$extends(withAccelerate())
//pass the post id in the body
  const userId = c.get('userId');
  const body = await c.req.json();
  const {success} = updatePostInput.safeParse(body);
  if(!success){
    c.status(411)
    return c.json({'message':'incorrect inputs'})
  }
  const postId =  c.req.param('pId');
  const postData = await prisma.post.update({
    where:{
      id:postId,
      authorId:userId
    },
    data:{
      content:body.content,
      published:body.published,
      title:body.title
    },
  })
  
  return c.json({'updated create blog user':userId,'postId':postData});
  
})
//get all the particular post 
app.get('/api/v1/blog/:pId',async (c)=>{
  const prisma = new PrismaClient({
    datasourceUrl: c.env.DATABASE_URL,
  }).$extends(withAccelerate())
  const postId = c.req.param('pId');
 // const postId = c.body.postId;
  const posts = await prisma.post.findFirst({
    where:{
      id:postId
    },
    select:{
      id:true,
      title:true,
      content:true,
      author:{
        select:{
          name:true
        }
      }
    }
  })
  console.log(posts,"------");

  return c.json({'user_posts_uid':posts});
});
//give away all posts
app.get('/api/v1/blog/bulk/posts',async (c)=>{
  const prisma = new PrismaClient({
    datasourceUrl: c.env.DATABASE_URL,
  }).$extends(withAccelerate())
  const userId = c.get('userId');
  //const postId = c.body.postId;
  const posts = await prisma.post.findMany({
    select: {
      content: true,
      title: true,
      id: true,
      author: {
        select:{
          name: true
        }
      }
    }
  });
  return c.json({'user_posts_all':posts});
  //return c.json('all blog listed:')
})
export default app