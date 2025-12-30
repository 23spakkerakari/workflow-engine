import os
import time
import requests
from dotenv import load_dotenv

load_dotenv()

ENRICH_ASYNC_URL = "https://api.sixtyfour.ai/enrich-lead-async"
JOB_STATUS_URL = "https://api.sixtyfour.ai/job-status/{task_id}"
FIND_EMAIL_URL = "https://api.sixtyfour.ai/find-email"

SIXTYFOUR_API_KEY = os.getenv("SIXTYFOUR_API_KEY")
HEADERS = {
        "x-api-key": SIXTYFOUR_API_KEY,
        "Content-Type": "application/json",
    }

def poll_enrich_result(task_id: str, sleep_for = 1.0):
    start = time.time()
    while True:
        if time.time() - start > 350.0:
            raise TimeoutError(f"Sixtyfour enrich async task {task_id} timed out")

        #is this making a request to sixtyfour api?
        #hopefully not losing money with job status polling
        r = requests.get(
            JOB_STATUS_URL.format(task_id=task_id),
            headers={"x-api-key": SIXTYFOUR_API_KEY},
            timeout=45,
        )
        r.raise_for_status()
        status_data = r.json()

        status = status_data.get("status")
        if status == "completed":
            return status_data.get("result") or {}
        if status == "failed":
            err = status_data.get("error", "Unknown error")
            raise RuntimeError(f"Sixtyfour async task failed: {err}")

        time.sleep(sleep_for)
        sleep_for = min(sleep_for * 1.5, 10.0) 

def enrich_one_row(row_dict: dict):
    """
    Calls enrich-lead-async + polls until done.
    Takes in a row_dict that should be funneled in from thread-handled dataframe
    Returns dict of extracted fields to merge into dataframe.
    """
    struct = {
        "name": "The individual's full name",
        "email": "The individual's email address",
        "phone": "The individual's phone number",
        "company": "The company the individual is associated with",
        "title": "The individual's job title",
        "linkedin": "LinkedIn URL for the person",
        "website": "Company website URL",
        "location": "The individual's location and/or company location",
        "industry": "Industry the person operates in",
        "education": "Educational background including undergrad university",
    }


    lead_info = {
        "name": row_dict.get("name"),
        "title": row_dict.get("email"),
        "company": row_dict.get("company_location"),
        "location": row_dict.get("company"),
        "linkedin": row_dict.get("linkedin"),
    }

    print("\n\nRow dict:", row_dict.keys())
    print("\n\nLEAD INFO:", lead_info.keys())

    if not lead_info.get("name") and not lead_info.get("linkedin") and not lead_info.get("company"):
        print("\nskip row for limited info\n")
        return {}  

    post_body = {"lead_info": lead_info, "struct": struct}

    start = time.time()
    resp = requests.post(ENRICH_ASYNC_URL, headers= HEADERS, json=post_body, timeout=60)
    resp.raise_for_status()
    task_info = resp.json()

    task_id = task_info.get("task_id")
    if not task_id:
        raise RuntimeError(f"Sixtyfour enrich-lead-async missing task_id. Response: {task_info}")

    result = poll_enrich_result(
        task_id
    )

    if not isinstance(result, dict):
        return {}

    print("\n\nENRICH RESULT:", result)
    print("******TOTAL TIME FOR ROW", time.time() - start, "seconds\n\n")
    return result


def find_email_one_row(row_dict: dict, mode: str):
    """
    Calls find-email. 
    Takes in thread-handled row, (shouldn't take much testing)
    Returns dict of fields to merge into df.
    """

    lead = {
        "name": row_dict.get("name"),
        "company": row_dict.get("company"),
        "title": row_dict.get("title"),
        "phone": row_dict.get("phone"),
        "linkedin": row_dict.get("linkedin"),
    }
    
    if not lead.get("name") and not lead.get("linkedin"):
        print("EARLY RETURN;name and linkedin are empty")
        print("lead dict:", lead)
        return {}

    print("✅ Passed validation - about to make API call")
    print("Lead info:", lead)
    
    resp = requests.post(
        FIND_EMAIL_URL,
        headers=HEADERS,
        json={"lead": lead, "mode": mode},
        timeout=90,
    )
    resp.raise_for_status() 
    data = resp.json()

    # print("\n\nDATA:", data)

    email = ''
    if mode == 'PERSONAL':
        email = data.get("personal_email")
    elif mode == 'PROFESSIONAL':
        email = data.get("email")
    
    print("Email:", email[0][0])
    row_dict["email"] = email[0][0]
    print("\n\nROW DICT:", row_dict)
    return row_dict
