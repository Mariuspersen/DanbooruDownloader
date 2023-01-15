#!/usr/bin/env node
let args = process.argv.splice(2);
const fs = require('fs');

//simple function to exttract the fetch command that includes the tag and page
const danbooru_get_tag_json_list = (tag, page) => fetch(`https://danbooru.donmai.us/posts.json?page=${page}&tags=${tag}`).then(res => res.json());

const download_status = async (title,total,current,job_id) => {
    const progress = 100 * current / total;
    // Use the process.stdout.write method to update the console with the current download status
    // The `\033[` is an escape code for controlling the console cursor
    // The first number after `\033[` is the line number, the second number is the column number
    // H moves the cursor to the position specified by the line and column numbers
    // This line of code is moving the cursor to the line specified by the job_id+3, and the first column
    process.stdout.write(`${"\033["+(job_id+3)+";0H"}`);
    // Prints the title of the download job
    process.stdout.write(title+':');
    // Move the cursor to the position specified by the job_id+3, and the 30th column
    process.stdout.write(`${"\033["+(job_id+3)+";30H"}`);
    // Prints an open square bracket "["
    process.stdout.write('[')
    // The escape code `\033[47m` sets the background color to white
    process.stdout.write(`${"\033[47m"}`);
    // Repeats a space character " "  the length of Math.floor(progress)
    process.stdout.write(`${' '.repeat(Math.floor(progress))}`);
    // The escape code `\033[0m` resets the console color
    process.stdout.write(`${"\033[0m"}`);
    // Repeats a space character " "  the length of Math.floor(100-(progress))
    process.stdout.write(`${' '.repeat(Math.floor(100-(progress)))}`);
    // Prints a closed square bracket "]"
    process.stdout.write('] ');
    // Prints the current file number being downloaded
    process.stdout.write(`${current+1}/`);
    // Prints the total number of files to be downloaded
    process.stdout.write(`${total}    `);
}

const get_all_file_urls = async (tag, start,end) => {
    // Initialize an empty array to hold the responses
    let responses = [];
    // Loop through the range of start and end, calling the danbooru_get_tag_json_list function with the tag and current index as arguments
    for (let i = start; i < end; i++) {
        responses.push(danbooru_get_tag_json_list(tag, i));
    }
    // Declare a variable to hold all the posts
    let all_posts;
    try {
        // Use the Promise.all method to wait for all the responses to come back, then map the data to extract the file_urls and store them in the all_posts variable
        all_posts = await Promise.all(responses).then(data => data.map(posts => posts.map(post => post.file_url)));
        // Use the spread operator and Array.concat method to flatten the nested array, then filter out any undefined values
        return [].concat(...all_posts).filter(post => post != undefined);

    } catch (e) {
        // If there is an error, write the error message to a file called errors.log
        fs.appendFileSync('./errors.log',"Error getting json list: \n" + e + "\n",'utf-8');
        return;
    }
}

const download_all_images = async (tag, list,job_id,api_key,username) => {
    // Initialize a count variable to keep track of the number of images downloaded
    let count = 0;
    // Use the Promise.all method to download all the images in parallel
    let blobs = await Promise.all(list.map(async link => {
        let response;
        try {
            // Initialize a new Headers object
            let headers = new Headers();
            // Check if the api_key and username have been provided
            if(api_key && username) {
                // Create a buffer from the concatenated username and api_key, encoded as base64
                let buffer = Buffer.from(`${username}:${api_key}`).toString('base64');
                headers.append("Authorization", "Basic "+ buffer);
            }
            // Fetch the image using the link provided
            response = await fetch(link, { headers: headers });
            if(!response) {
                return;
            }
            // Get the image as an ArrayBuffer
            let buffer = await response.arrayBuffer();
            // Split the link to get the file type
            let link_split = link.split('.');
            // Use the process.stdout.write method to hide the cursor
            process.stdout.write("\033[?25l");
            // Update the console with the download progress
            await download_status(tag,list.length,count++,job_id);
            // Return an object containing the ArrayBuffer, file type and file name
            return {
                buffer: buffer,
                filetype: link_split.pop(),
                filename: link_split.pop().split('/').pop(),
            }
        } catch (e) {
            // If there is an error, write the error message to a file called errors.log
            fs.appendFileSync('./errors.log',"Error downloading image: \n" + e + "\n",'utf-8');
            return;
        }
    }));
    const invalidCharsRegex = /[\\/:*?"<>|]/g; //regex pattern to match invalid characters
    let safeTag = tag.replace(invalidCharsRegex, '_'); // replace invalid characters with _
    if (!fs.existsSync(`./${safeTag}`)) {
        fs.mkdirSync(`./${safeTag}`);
    }
    // Use the process.stdout.write method to show the cursor
    process.stdout.write('\n')
    process.stdout.write("\033[?25h");
    // Write the downloaded images to the directory with their original file name and type
    blobs.filter(x => x !== undefined).forEach(blob => {        
        fs.writeFile(`./${safeTag}/${blob.filename}.${blob.filetype}`, Buffer.from(blob.buffer), function(err){
            if(err) throw err;
        });
    });
}

const print_help = () => {
    process.stdout.write("Usage:\n\tnode dbdl.js api=[api-key] username=[username] [tag] [number of pages] [tag] [number of pages]...");
    process.exit(1);
}

const main = async () => {
    process.stdout.write('\x1Bc')
    process.stdout.write("-- Danbooru Download--\nA simple javascript terminal application to download images based on tags\n");
    if(args.length == 0) {
        print_help();
    }
    const asked_for_help = args.reduce((a,arg) => arg == "--help")
    
    if(asked_for_help == "--help") {
        print_help();
    }

    const api_key = args.filter(arg => arg.includes("api=")).pop()?.split('=').pop();
    const username = args.filter(arg => arg.includes("username=")).pop()?.split('=').pop();

    if((api_key && !username)||(!api_key && username)) {
        process.stdout.write(`You need both api and username if you wish to use that function\n`);
        process.exit(1);
    }

    args = args.filter(arg => !arg.includes("="));
    
    if(args.length % 2) {
        process.stdout.write(`Invalid number of arguments\n`);
        process.exit(1);
    }
    
    for (let i = 0; i < args.length; i=i+2) {
        const tag = args[i];
        let pages = Number(args[i+1]);
        let range = args[i+1].match(/^\d+-\d+$/)?.[0].split('-')

        if(Number.isNaN(pages) && !range) {
            process.stdout.write(`Pages is not a number or a range\n`);
            process.exit(1);
        };

        if(range?.[0] > range?.[1]) {
            process.stdout.write(`Invalid range, lowest number first\n`);
            process.exit(1);
        }

        if(Math.sign(pages) == -1) {
            process.stdout.write(`Pages cannot be a negative number\n`);
            process.exit(1);
        }
        
        const list_to_download = range ? await get_all_file_urls(tag,range[0],range[1]) : await get_all_file_urls(tag,0,pages)

        if(!list_to_download) {
            continue;
        }

        download_all_images(tag,list_to_download ,Math.floor(i/2),api_key,username)

    }
}

main();