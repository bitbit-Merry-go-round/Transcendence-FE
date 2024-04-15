import { NAVIGATE_DRIRECTION, route } from "@/router";

function fetch_failed(url, res) {
    console(url);
    // TODO: access 토큰 또는 refresh 토큰 유효하지 않을 경우 처리할 로직.
    //   route({
    //     path: "/login",
    //     direction: NAVIGATE_DRIRECTION.backward
    //   })
}

/**
 * httpRequest.
 * @param {string} method 
 * @param {string} url 
 * @param {object} body 
 * @param {function} success 
 * @param {function} fail
*/
export default function httpRequest(method, url, body, success, fail = fetch_failed) {
    const access = localStorage.getItem("access");
    const headers = {
        "Content-Type": "application/json"
    };
    if (access && access != 'undefined')
    {
        headers.Authorization = `Bearer ${access}`;
    }
    fetch(url, {
        method: method,
        mode: "cors",
        headers: headers,
        body: body
    })
    .then((res) => {
        if (res.status === 204)
            return ;
        if (200 <= res.status && res.status < 300) 
            return res.json();
        const refresh = localStorage.getItem("refresh")
        if (res.status === 401 && refresh) {
            const GET_TOKEN_URI = `${window.location.protocol}//${window.location.host}/api/token/refresh/`;
            const body = JSON.stringify({
                'refresh': `${refresh}`
            });
            fetch(GET_TOKEN_URI, {
                method: "POST",
                headers: headers,
                body: body
            })
            .then((res) => res.json())
            .then((result) => {
                localStorage.setItem("access", result.access)
                localStorage.setItem("refresh", result.refresh)
            })
            .then(() => {
                httpRequest(method, url, body, success, () => {
                    // throw new Error(`${res.status}`);
                })
            })
            .catch(() => {
                localStorage.removeItem('refresh');
            })
        }
        else {
            // throw new Error(`${res.status}`);
        }
    })
    .then((json) => {
        success(json);
    })
    .catch((res) => {
        fail(url, res);
    })
}
