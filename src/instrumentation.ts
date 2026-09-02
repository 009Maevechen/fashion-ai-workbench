export async function register(){
  if(process.env.NEXT_RUNTIME==="nodejs"){
    const {configureSharpMemory}=await import("./lib/image-limits");
    configureSharpMemory();
    const {initializeJobState}=await import("./lib/job-runner");
    await initializeJobState();
  }
}
