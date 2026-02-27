function handler(event) {
    var request = event.request;
    var uri = request.uri;

    // 파일 확장자가 있으면 그대로 통과 (.js, .css, .png 등)
    if (/\.[^\/]+$/.test(uri)) {
        return request;
    }

    // SPA 라우팅: 확장자 없는 경로는 container index.html로 rewrite
    request.uri = '/container/latest/index.html';
    return request;
}
