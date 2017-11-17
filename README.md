$ mkdir master
$ mkdir minion1
$ mkdir minion2

Find the IP addresses for your VMs and alias them in your cluster’s /etc/hosts file…
# vi /etc/hosts
172.28.128.6	master
172.28.128.9	minion1

Disable
$ vagrant ssh
# sudo su
# yum install -y wget

Disable selinux
# vi /etc/sysconfig/selinux
	#SELINUX=enabled
	SELINUX=disabled
# reboot

$ vagrant ssh
# sudo su

Check to assure selinux is disabled
# sestatus
disabled

# cd /etc
# wget https://github.com/kubernetes/kubernetes/releases/download/v1.8.3/kubernetes.tar.gz
# tar -zvxf kubernetes.tar.gz -C .
The binaries aren’t included, so they need to be downloaded and extracted…
# cd /etc/kubernetes/cluster
# ./get-kube-binaries.sh
# cd ../server
# tar -zvxf kubernetes-server-linux-amd64.tar.gz -C .
Set you cluster name…
# echo "export CLUSTER_NAME=sl" >> /etc/environment
# exit
# exit
$ vagrant ssh
# sudo su
# echo $CLUSTER_NAME
sl
Copy the binaries to the bin directory…
# cd /etc/kubernetes/server/kubernetes/server/bin &&
cp kube-apiserver /usr/bin &&
cp kube-controller-manager /usr/bin &&
cp kube-proxy /usr/bin &&
cp kube-scheduler /usr/bin &&
cp kubelet /usr/bin &&
mkdir /var/lib/kubelet

Install ntp…
# yum install -y ntp
# systemctl enable ntpd && systemctl start ntpd

Install etcd…
# yum -y install etcd

Minions need to install docker…
# yum install -y docker

Create the configuration files for the binaries…
MASTER and MINIONS…
# vi /etc/kubernetes/config
KUBE_LOGTOSTDERR="--logtostderr=true"
KUBE_LOG_LEVEL="--v=0"
KUBE_ALLOW_PRIV="--allow-privileged=false"
KUBE_MASTER="--master=http://master:8080"
KUBE_ETCD_SERVERS="--etcd-servers=http://master:2379"

MASTER…
# vi /etc/kubernetes/kubelet
KUBELET_ADDRESS="--address=127.0.0.1"
KUBELET_HOSTNAME="--hostname-override=127.0.0.1"
KUBELET_API_SERVER="--api-servers=http://127.0.0.1:8080"
KUBELET_POD_INFRA_CONTAINER="--pod-infra-container-image=registry.access.redhat.com/rhel7/pod-infrastructure:latest"
KUBELET_ARGS=""

MINION…
# vi /etc/kubernetes/kubelet
KUBELET_ADDRESS="--address=0.0.0.0"
KUBELET_PORT="--port=10250"
KUBELET_HOSTNAME="--hostname-override=minion1"
KUBELET_API_SERVER="--api-servers=http://master:8080"
#KUBELET_POD_INFRA_CONTAINER="--pod-infra-container-image=registry.access.redhat.com/rhel7/pod-infrastructure:latest"

KUBELET_ADDRESS="--address=0.0.0.0"
KUBELET_PORT="--port=10250"
KUBELET_HOSTNAME="--hostname-override=minion1"
#KUBELET_API_SERVER="--api-servers=http://master:8080"
##KUBELET_POD_INFRA_CONTAINER="--pod-infra-container-image=registry.access.redhat.com/rhel7/pod-infrastructure:latest"
KUBELET_KUBECONFIG="--kubeconfig=/etc/kubernetes/kubeconfig --require-kubeconfig"
KUBELET_ARGS="--fail-swap-on=false --require-kubeconfig --cgroup-driver=systemd”

# /etc/kubernetes/kubeconfig


# vi /etc/kubernetes/apiserver
KUBE_ETCD_SERVERS="--etcd-servers=http://127.0.0.1:2379"
KUBE_SERVICE_ADDRESSES="--service-cluster-ip-range=10.254.0.0/16"
#KUBE_ADMISSION_CONTROL="--admission-control=NamespaceLifecycle,NamespaceExists,LimitRanger,SecurityContextDeny,ServiceAccount,ResourceQuota"
KUBE_API_ARGS=""
ETCD_LISTEN_CLIENT_URLS="http://0.0.0.0:2379"
ETCD_ADVERTISE_CLIENT_URLS="http://0.0.0.0:2379"
KUBE_API_ADDRESS="--address=0.0.0.0"
KUBE_API_PORT="--port=8080"
KUBELET_PORT="--kubelet-port=10250"

# vi /etc/kubernetes/controller-manager
KUBE_CONTROLLER_MANAGER_ARGS=""

# vi /etc/kubernetes/scheduler
KUBE_SCHEDULER_ARGS=""

# vi /etc/kubernetes/proxy
KUBE_PROXY_ARGS=""

# vi /etc/etcd/etcd.conf
…Add these lines…
ETCD_LISTEN_CLIENT_URLS="http://0.0.0.0:2379"
ETCD_ADVERTISE_CLIENT_URLS="http://0.0.0.0:2379"



Create the service definitions for the kubernetes binaries that need to be run on the MASTER…
# vi /usr/lib/systemd/system/kube-apiserver.service
[Unit]
Description=Kubernetes API Server
Documentation=https://github.com/GoogleCloudPlatform/kubernetes
After=network.target
After=etcd.service

[Service]
EnvironmentFile=-/etc/kubernetes/config
EnvironmentFile=-/etc/kubernetes/apiserver
User= root
ExecStart=/usr/bin/kube-apiserver \
            $KUBE_LOGTOSTDERR \
            $KUBE_LOG_LEVEL \
            $KUBE_ETCD_SERVERS \
            $KUBE_API_ADDRESS \
            $KUBE_API_PORT \
            $KUBELET_PORT \
            $KUBE_ALLOW_PRIV \
            $KUBE_SERVICE_ADDRESSES \
            $KUBE_ADMISSION_CONTROL \
            $KUBE_API_ARGS
Restart=on-failure
Type=notify
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target

# vi /usr/lib/systemd/system/kube-controller-manager.service
[Unit]
Description=Kubernetes Controller Manager
Documentation=https://github.com/GoogleCloudPlatform/kubernetes

[Service]
EnvironmentFile=-/etc/kubernetes/config
EnvironmentFile=-/etc/kubernetes/controller-manager
User= root
ExecStart=/usr/bin/kube-controller-manager \
            $KUBE_LOGTOSTDERR \
            $KUBE_LOG_LEVEL \
            $KUBE_MASTER \
            $KUBE_CONTROLLER_MANAGER_ARGS
Restart=on-failure
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target

# vi /usr/lib/systemd/system/kube-scheduler.service
[Unit]
Description=Kubernetes Scheduler Plugin
Documentation=https://github.com/GoogleCloudPlatform/kubernetes

[Service]
EnvironmentFile=-/etc/kubernetes/config
EnvironmentFile=-/etc/kubernetes/scheduler
User=root
ExecStart=/usr/bin/kube-scheduler \
            $KUBE_LOGTOSTDERR \
            $KUBE_LOG_LEVEL \
            $KUBE_MASTER \
            $KUBE_SCHEDULER_ARGS
Restart=on-failure
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target

Create the service definitions for the kubernetes binaries that need to be run on the MINIONS…
$ vi /usr/lib/systemd/system/kubelet.service
[Unit]
Description=Kubernetes Kubelet Server
Documentation=https://github.com/GoogleCloudPlatform/kubernetes
After=docker.service
Requires=docker.service

[Service]
WorkingDirectory=/var/lib/kubelet
EnvironmentFile=-/etc/kubernetes/config
EnvironmentFile=-/etc/kubernetes/kubelet
User=root
ExecStart=/usr/bin/kubelet \
            $KUBE_LOGTOSTDERR \
            $KUBE_LOG_LEVEL \
            $KUBELET_KUBECONFIG \
            $KUBELET_ADDRESS \
            $KUBELET_PORT \
            $KUBELET_HOSTNAME \
            $KUBE_ALLOW_PRIV \
            $KUBELET_POD_INFRA_CONTAINER \
            $KUBELET_ARGS
Restart=on-failure

[Install]
WantedBy=multi-user.target



# vi /usr/lib/systemd/system/kube-proxy.service
[Unit]
Description=Kubernetes Kube-Proxy Server
Documentation=https://github.com/GoogleCloudPlatform/kubernetes
After=network.target

[Service]
EnvironmentFile=-/etc/kubernetes/config
EnvironmentFile=-/etc/kubernetes/proxy
ExecStart=/usr/bin/kube-proxy \
            $KUBE_LOGTOSTDERR \
            $KUBE_LOG_LEVEL \
            $KUBE_MASTER \
            $KUBE_PROXY_ARGS
Restart=on-failure
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target


Start everything up…
MASTER
# systemctl enable etcd kube-apiserver kube-controller-manager kube-scheduler
# systemctl start etcd kube-apiserver kube-controller-manager kube-scheduler

MINION
# systemctl enable kube-proxy kubelet docker
# systemctl start kube-proxy kubelet docker

…and check to make sure everything is running…
MASTER
# systemctl status etcd kube-apiserver kube-controller-manager kube-scheduler | grep "(running)" | wc -l
4

MINION
systemctl status kube-proxy kubelet docker  | grep "(running)" | wc -l
3
docker images
docker --version
docker pull hello-world
docker run hello-world

Install and run kubectl from your host machine…

# cd /tmp
# curl -LO https://storage.googleapis.com/kubernetes-release/release/`curl -s https://storage.googleapis.com/kubernetes-release/release/stable.txt`/bin/darwin/amd64/kubectl
# chmod +x ./kubectl
# sudo mv ./kubectl /usr/local/bin/kubectl
# kubectl cluster-info

# vi .kube/config
apiVersion: v1
clusters:
- cluster:
    server: http://172.28.128.3:8080
  name: localvm
- cluster:
    server: http://172.28.128.6:8080
  name: sl
contexts:
- context:
    cluster: localvm
    user: localvm
  name: localvm
- context:
    cluster: sl
    user: sl
  name: sl
current-context: sl
kind: Config
preferences: {}
users:
- name: cluster-admin
  user:
    password: password
    username: admin

Test your deployment…
# cd ~/Documents/projects/serverless
# mkdir helloworld && cd helloworld
# vi server.js
var http = require('http');

var handleRequest = function(request, response) {
  console.log('Received request for URL: ' + request.url);
  response.writeHead(200);
  response.end('Hello World!');
};
var www = http.createServer(handleRequest);
www.listen(8080);

# node server.js
	goto http://localhost:8080/ to test
# <ctrl-c>
# vi Dockerfile
FROM node:6.9.2
EXPOSE 8080
COPY server.js .
CMD node server.js

# docker build -t helloworld:v1 .
# docker login
	enter username/password
# docker tag helloworld:v1 ulls/helloworld:v1
# docker push ulls/helloworld:v1


$ mkdir sl-test && cd sl-test
$ vi server.js
var http = require('http');

var handleRequest = function(request, response) {
  console.log('Received request for URL: ' + request.url);
  response.writeHead(200);
  response.end('Hello World!');
};

console.log('Starting Server on port 8080...');
var www = http.createServer(handleRequest).listen(8080, function(){
    console.log('OK. HTTP server started');
});

var sockets = {}, nextSocketId = 0;
www.on('connection', function (socket) {
    var socketId = nextSocketId++;
    sockets[socketId] = socket;
    console.log('socket', socketId, 'opened');

    socket.on('close', function () {
        console.log('socket', socketId, 'closed');
        delete sockets[socketId];
    });
});

var end = function(){
    www.close(function () {
        console.log('...app is shutting down');
        process.exit(0);
    });
    for (var socketId in sockets) {
        console.log('socket connection', socketId, 'destroyed');
        sockets[socketId].destroy();
    }
};
process.on('SIGTERM', function () {
    console.log('SIGTERM issued... ');
    end();
});

process.on('SIGINT', function() {
    console.log('SIGINT issued... ');
    end();
});

$ vi Dockerfile
FROM node:6.9.2
EXPOSE 8080
COPY server.js .
CMD node server.js

Create a local docker repo…
Create a local Docker registry to deploy your container to
$ docker run -d \
  -p 5000:5000 \
  --restart=always \
  --name registry \
  registry:2
Get the new image id
$ docker images | grep java-test
(<image id> = 12 random characters)
$ docker tag <image id> localhost:5000/java-test:0.1
$ docker push 127.0.0.1:5000/java-test:0.1
Check to see that your image has been pushed to the local registry
$ curl http://127.0.0.1:5000/v2/_catalog

In your Vagrant VM running a K8 minion, find the default gateway to talk to the host OS
# sudo yum install net-tools
# netstat -rn
Destination     Gateway         Genmask         Flags   MSS Window  irtt Iface
0.0.0.0         10.0.2.2        0.0.0.0         UG        0 0          0 eth0
Check to see you can access host OS local repository
# curl http://10.0.2.2:5000/v2/_catalog

In order for the minion to be able to pull the local image, you need to tell Docker to allow for insecure connections to repositories.
Create or modify /etc/docker/daemon.json
{ "insecure-registries":["docker.for.mac.localhost:5000","10.0.2.2:5000","local-docker-repo:5000"] }
Restart docker daemon
# sudo service docker restart
Add an entry to your minion’s /etc/hosts file...
# vi /etc/hosts
	10.0.2.2        local-docker-repo
# curl http://local-docker-repo:5000/v2/_catalog

Containerize your server.js app into a docker container…
$ docker build -t local-docker-repo:5000/sl-test .
$ docker tag local-docker-repo:5000/sl-test local-docker-repo:5000/sl-test:0.1
$ docker push local-docker-repo:5000/sl-test

$ docker tag sl-test:latest ulls/sl-test:0
$ docker push ulls/sl-test
$ kubectl run sl-test --image=docker pull ulls/sl-test:0 --port=8080


Create kubernetes deployment and service yml file…
## YAML Template.
---

kind: Service
apiVersion: v1
metadata:
  name: sl-test
spec:
  type: NodePort
  selector:
    app: sl-test
  ports:
  - name: http
    protocol: TCP
    port: 8088
    targetPort: 8080
    nodePort: 31008

---

apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: sl-test
  labels:
    app: sl-test
    environment: local
spec:
  replicas: 1
  selector:
    matchLabels:
      app: sl-test
  template:
    metadata:
      labels:
        app: sl-test
    spec:
      containers:
      - name: sl-test
        image: local-docker-repo:5000/sl-test:latest
        imagePullPolicy: Always
        ports:
          - containerPort: 8080

Deploy the container to your new cluster…

Test your deployment by navigating to http://<IP of your MINION>:31008/


Switching kubectl between k8 clusters
$ vi ~/.kube/config
$ kubectl config use-context <context name>
