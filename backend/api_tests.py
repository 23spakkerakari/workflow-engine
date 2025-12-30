import requests
import time 



response = requests.post(
    'https://api.sixtyfour.ai/enrich-lead-async',
    headers={
        'x-api-key': API_KEY,
        'Content-Type': 'application/json'
    },
    json={
        "lead_info": {
            "name": "Saarth Shah",
            "title": "CEO & Co-Founder @ Sixtyfour AI",
            "company": "Sixtyfour AI",
            "location": "San Francisco",
            "linkedin": "https://www.linkedin.com/in/saarthshah"
        },
        "struct": {
            "name": "The individual's full name",
            "email": "The individual's email address",
            "phone": "The individual's phone number",
            "company": "The company the individual is associated with",
            "title": "The individual's job title",
            "linkedin": "LinkedIn URL for the person",
            "website": "Company website URL",
            "location": "The individual's location and/or company location",
            "industry": "Industry the person operates in"
        }
    }
)

task_info = response.json()

print(task_info)
task_id = task_info['task_id']

# result polling (not job status polling)
while True:
    # print("in loop. making get request on job ")
    status_response = requests.get(
        f'https://api.sixtyfour.ai/job-status/{task_id}',
        headers={'x-api-key': API_KEY}
    )
    
    status_data = status_response.json()
    print("Current status, " + str(status_data["status"]))
    if status_data['status'] == 'completed':
        results = status_data['result']
        break
    elif status_data['status'] == 'failed':
        print(f"Job failed: {status_data.get('error', 'Unknown error')}")
        break
    
    time.sleep(10)  # Wait 10 seconds before checking again

print("Enriched Lead Data:")
print(results)