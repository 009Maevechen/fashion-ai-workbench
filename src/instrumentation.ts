export async function register(){
  if(process.env.NEXT_RUNTIME==="nodejs"){
    const {initializeJobState}=await import("./lib/job-runner");
    await initializeJobState();
  }
}
